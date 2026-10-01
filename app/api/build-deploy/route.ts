import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { getOpenAI } from '@/lib/openai';

export const runtime = 'nodejs';

type GeneratedFile = { path: string; content: string };

type GeneratedSite = { files: GeneratedFile[]; missingRequirements?: string[] };

function validateGeneratedSite(site: GeneratedSite, chatbot: boolean) {
  const paths = new Set((site.files || []).map(f => f.path.replace(/^\//, '')));
  const required = ['package.json', 'app/layout.tsx', 'app/page.tsx', 'app/admin/page.tsx', 'app/sitemap.ts', 'app/robots.ts'];
  if (chatbot) required.push('app/api/chat/route.ts');
  return required.filter(p => !paths.has(p));
}

async function waitForVercelDeployment(id: string, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const d = await vercel(`/v13/deployments/${encodeURIComponent(id)}`);
    const state = String(d.readyState || d.status || '');
    if (state === 'READY') return d;
    if (['ERROR','CANCELED','CANCELLED'].includes(state)) throw new Error(`Vercel deployment ${state.toLowerCase()}.`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Vercel deployment did not become ready within the verification window.');
}

async function gh(path: string, opts: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function vercel(path: string, opts: RequestInit = {}) {
  const query = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const r = await fetch(`https://api.vercel.com${path}${query}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Vercel API ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getProfile(req);
    if (!ctx) return NextResponse.json({ error: 'Login required' }, { status: 401 });
    if (!process.env.GITHUB_TOKEN || !process.env.VERCEL_TOKEN) {
      return NextResponse.json({ error: 'Deployment is not configured. Add GITHUB_TOKEN and VERCEL_TOKEN on the server.' }, { status: 503 });
    }

    const body = await req.json();
    const prompt = String(body.prompt || '');
    if (!prompt) return NextResponse.json({ error: 'Website request is required' }, { status: 400 });

    const ai = getOpenAI();
    const baseSystem = 'Generate a coherent production-oriented Next.js App Router website. Return ONLY JSON: {"files":[{"path":"...","content":"..."}],"missingRequirements":["..."]}. Do not invent client facts. Use clearly marked placeholders only where the client has not supplied required assets, and list every missing asset in missingRequirements. The output MUST include package.json, app/layout.tsx, app/page.tsx, app/admin/page.tsx, app/sitemap.ts, app/robots.ts, secure server-side environment handling, a client-friendly admin area relevant to the selected website type, SEO metadata, and real error states. If chatbot is enabled, include app/api/chat/route.ts using only the client-owned AI credential. Never put secrets in NEXT_PUBLIC_* or source files.';
    let generated = await ai.chat.completions.create({ model:'gpt-4o-mini', messages:[{role:'system',content:baseSystem},{role:'user',content:prompt}], max_tokens:16000 });
    let content = generated.choices[0]?.message?.content || '';
    let json = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as GeneratedSite;
    let missing = validateGeneratedSite(json, Boolean(body.chatbot_enabled));
    if (missing.length) {
      generated = await ai.chat.completions.create({ model:'gpt-4o-mini', messages:[{role:'system',content:baseSystem},{role:'user',content:`Your previous output was incomplete. These required files were missing: ${missing.join(', ')}. Return a corrected complete JSON project. Original request:\n${prompt}`}], max_tokens:18000 });
      content = generated.choices[0]?.message?.content || '';
      json = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as GeneratedSite;
      missing = validateGeneratedSite(json, Boolean(body.chatbot_enabled));
    }
    if (missing.length) return NextResponse.json({error:`Generated project is incomplete. Missing required files: ${missing.join(', ')}`},{status:422});

    const me = await gh('/user');
    const repoName = `${process.env.VERCEL_PROJECT_PREFIX || 'leo-site'}-${Date.now()}`;
    const repo = await gh('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, private: true, description: `Website generated by LEO for ${ctx.profile.email}`, auto_init: true }),
    });
    const ref = await gh(`/repos/${me.login}/${repoName}/git/ref/heads/main`);
    const base = ref.object.sha;
    const baseCommit = await gh(`/repos/${me.login}/${repoName}/git/commits/${base}`);
    const blobs = await Promise.all((json.files || []).map(async (f) => {
      const b = await gh(`/repos/${me.login}/${repoName}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
      });
      return { path: f.path, mode: '100644', type: 'blob', sha: b.sha };
    }));
    const tree = await gh(`/repos/${me.login}/${repoName}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
    });
    const commit = await gh(`/repos/${me.login}/${repoName}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Create website with LEO OS', tree: tree.sha, parents: [base] }),
    });
    await gh(`/repos/${me.login}/${repoName}/git/refs/heads/main`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });

    const publicEnv: Record<string, string> = {};
    const secretEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.env || {})) {
      if (typeof v !== 'string' || !v) continue;
      (k.startsWith('NEXT_PUBLIC_') ? publicEnv : secretEnv)[k] = v;
    }

    const project = await vercel('/v10/projects', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, framework: 'nextjs' }),
    }).catch(async (e) => {
      const existing = await vercel(`/v9/projects/${encodeURIComponent(repoName)}`).catch(() => null);
      if (existing) return existing;
      throw e;
    });
    const projectId = String(project.id || project.name || repoName);
    for (const [key, value] of Object.entries({ ...publicEnv, ...secretEnv })) {
      await vercel(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
        method: 'POST',
        body: JSON.stringify({ key, value, type: publicEnv[key] ? 'plain' : 'secret', target: ['production', 'preview', 'development'] }),
      });
    }
    if (body.custom_domain) {
      await vercel(`/v10/projects/${encodeURIComponent(projectId)}/domains`, { method:'POST', body:JSON.stringify({domain:String(body.custom_domain)}) });
    }

    const files = (json.files || []).map((f) => ({ file: f.path, data: f.content }));
    const deploy = await vercel('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, project: projectId, files, projectSettings: { framework: 'nextjs' }, target: 'production' }),
    });

    const deploymentId = String(deploy.id || deploy.uid || '');
    if (!deploymentId) throw new Error('Vercel did not return a deployment ID.');
    const readyDeployment = await waitForVercelDeployment(deploymentId);

    const db = adminSupabase();
    if (body.project_id) {
      const now = new Date();
      const ends = new Date(now);
      ends.setDate(ends.getDate() + Number(process.env.HOSTING_TRIAL_DAYS || 90));
      await db.from('website_projects').update({
        status: 'deployed',
        hosting_enforcement_status: 'active',
        github_repo: repo.html_url,
        vercel_project_id: projectId,
        live_deployment_id: deploymentId || null,
        suspended_deployment_id: null,
        live_url: readyDeployment.url ? `https://${readyDeployment.url}` : (deploy.url ? `https://${deploy.url}` : null),
        admin_url: (readyDeployment.url || deploy.url) ? `https://${readyDeployment.url || deploy.url}/admin` : null,
        client_name: body.client_name || null,
        client_email: body.client_email || null,
        client_whatsapp: body.client_whatsapp || null,
        custom_domain: body.custom_domain || null,
        updated_at: now.toISOString(),
      }).eq('id', body.project_id).eq('owner_user_id', ctx.user.id);

      const { data: existingHosting } = await db.from('hosting_subscriptions').select('id').eq('website_project_id', body.project_id).maybeSingle();
      if (!existingHosting) {
        await db.from('hosting_subscriptions').insert({
          website_project_id: body.project_id,
          client_email: String(body.client_email || ctx.profile.email || ''),
          plan: 'free_trial',
          status: 'trial',
          starts_at: now.toISOString(),
          ends_at: ends.toISOString(),
          next_renewal_at: ends.toISOString(),
        });
      }
    }

    const { error: deploymentEventError } = await db.from('deployment_events').insert({
      website_project_id: body.project_id || null,
      event_type: 'deploy',
      status: 'success',
      message: 'Deployment submitted to Vercel',
      metadata: {
        repo: repo.html_url,
        vercel: readyDeployment.url || deploy.url,
        deploymentId: deploy.id || deploy.uid || null,
        publicKeys: Object.keys(publicEnv),
        secretKeys: Object.keys(secretEnv),
        missingRequirements: json.missingRequirements || [],
      },
    });
    if (deploymentEventError) console.error('Could not record deployment event:', deploymentEventError.message);

    const liveUrl = (readyDeployment.url || deploy.url) ? `https://${readyDeployment.url || deploy.url}` : null;
    const websiteTier = String(body.website_tier || body.plan || (body.is_free === true ? 'Free Tier' : 'Paid Website'));
    const clientName = String(body.client_name || 'Client');
    const clientEmail = String(body.client_email || '').trim();
    const clientPhone = String(body.client_whatsapp || body.client_phone || '').trim();
    const ownerEmail = process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com';
    const wallOfLoveUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/wall-of-love`;

    async function sendResendEmail(to: string, subject: string, text: string, replyTo?: string) {
      if (!process.env.RESEND_API_KEY || !to) return false;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL || 'LEO OS <onboarding@resend.dev>',
          to: [to],
          reply_to: replyTo,
          subject,
          text,
        }),
      });
      return response.ok;
    }

    // Owner-only deployment notification. This runs only after Vercel reports READY.
    await sendResendEmail(
      ownerEmail,
      `🚀 Leo just finished creating ${clientName}'s website`,
      `Hey Boss Leonard 👑\n\nI just finished creating and deploying a website.\n\nClient: ${clientName}\nPhone: ${clientPhone || 'Not provided'}\nEmail: ${clientEmail || 'Not provided'}\nWebsite type: ${websiteTier}\nStatus: Successfully deployed\nLive website: ${liveUrl || 'Unavailable'}\nGitHub: ${repo.html_url}\n\nLeo OS deployment notification`,
      clientEmail || undefined,
    ).catch(() => false);

    // Client delivery email. Failure here must not make an already-successful deployment fail.
    if (clientEmail) {
      await sendResendEmail(
        clientEmail,
        `🎉 Your website is ready — ${clientName}`,
        `Hello ${clientName},\n\nYour website has been successfully created and deployed.\n\nLive website: ${liveUrl || 'Unavailable'}\n\nThank you for trusting LEO OS. If you are happy with the website, we would love a short review for our Wall of Love: ${wallOfLoveUrl}\n\n— Leo AI / LEO OS`,
      ).catch(() => false);
    }

    return NextResponse.json({
      status: 'deployed',
      githubUrl: repo.html_url,
      liveUrl,
      adminUrl: (readyDeployment.url || deploy.url) ? `https://${readyDeployment.url || deploy.url}/admin` : null,
      missingRequirements: json.missingRequirements || [],
      reviewUrl: wallOfLoveUrl,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Build/deploy failed' }, { status: 500 });
  }
}
