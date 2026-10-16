import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase, isPlatformOwner } from '@/lib/auth';
import { authenticateApiKey } from '@/lib/api-auth';
import { getTextOpenAI as getOpenAI, getConfiguredModel } from '@/lib/openai';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import type { ProjectType } from '@/lib/pricing';
import { getBuilderAvailability, getExternalModelBuilderAvailability } from '@/lib/builders/providers';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { withOperationalMonitoring } from '@/lib/monitoring';
import { validateMcpAccessToken, MCP_WRITE_SCOPE } from '@/lib/mcp/oauth';
import { normalizeIdePath, validateIdeFiles } from '@/lib/ide-files';
import { normalizeVercelDomain, resolveVerifiedVercelMainUrl, toVercelSubdomain, verifyPublicMainDomain } from '@/lib/vercel-deployment-url';

export const runtime = 'nodejs';

type GeneratedFile = { path: string; content: string };

type GeneratedSite = { files: GeneratedFile[]; missingRequirements?: string[] };

function validateGeneratedSite(site: GeneratedSite, chatbot: boolean) {
  const paths = new Set((site.files || []).map(f => f.path.replace(/^\//, '')));
  const required = ['package.json', 'app/layout.tsx', 'app/page.tsx', 'app/admin/page.tsx', 'app/sitemap.ts', 'app/robots.ts'];
  if (chatbot) required.push('app/api/chat/route.ts');
  return required.filter(p => !paths.has(p));
}

  async function waitForVercelDeployment(id: string, timeoutMs = 180000, onState?: (state: string) => Promise<void>) {
  const started = Date.now();
    let previousState = '';
  while (Date.now() - started < timeoutMs) {
    const d = await vercel(`/v13/deployments/${encodeURIComponent(id)}`);
    const state = String(d.readyState || d.status || '');
      if (state && state !== previousState) {
        previousState = state;
        await onState?.(state);
      }
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

type BuildContext = { id: string; projectId: string; userId: string };
type BuildStatus = 'building' | 'testing' | 'deploying' | 'live' | 'build_failed' | 'deploy_failed';

async function recordBuildState(
  context: BuildContext,
  status: BuildStatus,
  step: string,
  details: { message?: string; error?: string; deploymentId?: string | null; deploymentUrl?: string | null } = {},
) {
  const db = adminSupabase();
  const now = new Date().toISOString();
  const { data: current, error: readError } = await db.from('project_builds')
    .select('logs')
    .eq('id', context.id)
    .eq('owner_user_id', context.userId)
    .maybeSingle();
  if (readError) throw readError;
  const logs = Array.isArray(current?.logs) ? current.logs : [];
  const completed = ['live', 'build_failed', 'deploy_failed'].includes(status);
  const { error: buildError } = await db.from('project_builds').update({
    status,
    step,
    logs: [...logs, { at: now, status, step, message: details.message || step }].slice(-100),
    error: details.error || null,
    deployment_id: details.deploymentId,
    deployment_url: details.deploymentUrl,
    completed_at: completed ? now : null,
  }).eq('id', context.id).eq('owner_user_id', context.userId);
  if (buildError) throw buildError;
  const { error: projectError } = await db.from('website_projects').update({
    status: status === 'live' ? 'deployed' : status,
    build_status: status,
    build_step: step,
    ...(status === 'live' ? { live_url: details.deploymentUrl, live_deployment_id: details.deploymentId } : {}),
    updated_at: now,
  }).eq('id', context.projectId).eq('owner_user_id', context.userId);
  if (projectError) throw projectError;
}

export async function POST(req: NextRequest) {
  return withOperationalMonitoring(req, 'project.build_deploy', async ({ reportFailure, requestId }) => {
  let deploymentUrl: string | null = null;
  let mainDomainFailure: string | null = null;
  let buildContext: (BuildContext & { stage: 'building' | 'testing' | 'deploying' | 'live' }) | null = null;
  let mcpExternalModel = false;
  try {
    const browserContext = await getProfile(req);
    let ctx: { user: { id: string; email?: string | null }; profile: { role?: string | null; email?: string | null } } | null = browserContext
      ? { user: { id: browserContext.user.id, email: browserContext.user.email }, profile: browserContext.profile }
      : null;
    if (!ctx) {
      const authorization = req.headers.get('authorization') || '';
      const mcpBearer = /^Bearer\s+([A-Za-z0-9_-]{32,256})$/i.exec(authorization);
      if (mcpBearer) {
        const mcpToken = await validateMcpAccessToken(mcpBearer[1]);
        if (!mcpToken) return NextResponse.json({ error: 'A valid MCP access token is required.' }, { status: 401 });
        if (!mcpToken.scopes.includes(MCP_WRITE_SCOPE)) return NextResponse.json({ error: 'MCP project write permission is required.' }, { status: 403 });
        const { data: mcpProfile, error: profileError } = await adminSupabase().from('profiles')
          .select('id,email,role')
          .eq('id', mcpToken.userId)
          .maybeSingle();
        if (profileError || !mcpProfile) return NextResponse.json({ error: 'Account profile could not be loaded.' }, { status: 503 });
        ctx = { user: { id: mcpToken.userId, email: mcpProfile.email }, profile: mcpProfile };
        mcpExternalModel = true;
      }
    }
    if (!ctx) {
      const apiContext = await authenticateApiKey(req, 'write');
      if ('error' in apiContext) return apiContext.error;
      const { data: apiProfile } = await adminSupabase().from('profiles').select('id,email,role').eq('id', apiContext.userId).maybeSingle();
      if (!apiProfile) return NextResponse.json({ error: 'Account profile could not be loaded.' }, { status: 403 });
      ctx = { user: { id: apiContext.userId, email: apiProfile.email }, profile: apiProfile };
    }
    const limited = await enforceUserRateLimit(ctx.user.id, 'project-build-deploy', 3, 3600);
    if (limited) return limited;
    const body = await req.json();
    const userPrompt = String(body.prompt || '').trim();
    const customerProjectId = String(body.project_id || '');
    let suppliedMcpFiles: GeneratedFile[] | null = null;
    if (mcpExternalModel) {
      if (!Array.isArray(body.generated_files) || body.generated_files.length === 0 || body.generated_files.length > 250 ||
          body.generated_files.some((file: unknown) => !file || typeof file !== 'object' ||
            typeof (file as { path?: unknown }).path !== 'string' || typeof (file as { content?: unknown }).content !== 'string')) {
        return NextResponse.json({ error: 'MCP deployment requires 1–250 path/content files generated by the connected model.' }, { status: 400 });
      }
      suppliedMcpFiles = body.generated_files as GeneratedFile[];
      const fileMap = Object.fromEntries(suppliedMcpFiles.map(file => [file.path, file.content]));
      if (Object.keys(fileMap).length !== suppliedMcpFiles.length || !validateIdeFiles(fileMap) ||
          suppliedMcpFiles.some(file => normalizeIdePath(file.path) !== file.path || /^\.env(?:\.|$)/i.test(file.path))) {
        return NextResponse.json({ error: 'MCP deployment files contain duplicate, unsafe, secret-environment, or oversized paths.' }, { status: 400 });
      }
      const missingFiles = validateGeneratedSite({ files: suppliedMcpFiles }, false);
      if (missingFiles.length) return NextResponse.json({ error: `The connected model must provide the required application files: ${missingFiles.join(', ')}.` }, { status: 422 });
    }
    if (!customerProjectId) return NextResponse.json({ error: 'A saved project is required before building.' }, { status: 400 });
    if (!userPrompt) return NextResponse.json({ error: 'Website request is required' }, { status: 400 });
    const db = adminSupabase();
    const { data: ownedProject, error: projectError } = await db.from('website_projects')
      .select('id,project_type,website_type,business_name,custom_domain')
      .eq('id', customerProjectId)
      .eq('owner_user_id', ctx.user.id)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: 'Project ownership could not be verified.' }, { status: 500 });
    if (!ownedProject) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    const requestedCustomDomain = body.custom_domain || ownedProject.custom_domain;
    const customDomain = requestedCustomDomain ? normalizeVercelDomain(requestedCustomDomain) : null;
    if (requestedCustomDomain && !customDomain) {
      return NextResponse.json({ error: 'The configured main domain must be a valid HTTPS hostname without a path.' }, { status: 400 });
    }

    const owner = isPlatformOwner(ctx.profile);
    const plan = await getEffectiveUserPlan(ctx.user.id, owner);
    const projectType = String(ownedProject.project_type || 'website') as ProjectType;
    const requiredFeature = projectType === 'saas' ? 'saas-builder' : projectType === 'web_app' ? 'web-app-builder' : 'website-builder';
    if (!plan.projectTypes.includes(projectType) || !planAllows(plan, requiredFeature)) {
      return NextResponse.json({ error: 'This project type is not included in your current plan.', upgrade_url: '/pricing' }, { status: 403 });
    }
    const provider = mcpExternalModel
      ? getExternalModelBuilderAvailability(projectType)
      : getBuilderAvailability(projectType);
    if (provider.status !== 'ready') return NextResponse.json({ error: provider.message || 'Build provider is not configured.', provider: provider.id, requiredEnvironment: provider.requiredEnvironment }, { status: 503 });
    const { data: startedBuild, error: startError } = await db.rpc('start_customer_project_build', {
      p_project_id: customerProjectId,
      p_owner_user_id: ctx.user.id,
      p_provider: provider.id,
      p_monthly_limit: plan.limits.monthlyBuilds,
    });
    if (startError) {
      const limited = startError.message?.includes('Monthly build limit reached');
      return NextResponse.json({ error: startError.message || 'Build could not be started.', upgrade_url: limited ? '/pricing' : undefined }, { status: limited ? 429 : 500 });
    }
    buildContext = { id: String(startedBuild), projectId: customerProjectId, userId: ctx.user.id, stage: 'building' };
    const prompt = `Build a production-ready ${projectType.replaceAll('_', ' ')} named ${ownedProject.business_name || 'Customer Project'}.\n\n${userPrompt}`;

    let json: GeneratedSite;
    if (suppliedMcpFiles) {
      json = { files: suppliedMcpFiles };
    } else {
      const ai = getOpenAI();
      const baseSystem = 'Generate a coherent production-oriented Next.js App Router website. Return ONLY JSON: {"files":[{"path":"...","content":"..."}],"missingRequirements":["..."]}. Do not invent client facts. Use clearly marked placeholders only where the client has not supplied required assets, and list every missing asset in missingRequirements. The output MUST include package.json, app/layout.tsx, app/page.tsx, app/admin/page.tsx, app/sitemap.ts, app/robots.ts, secure server-side environment handling, a client-friendly admin area relevant to the selected website type, SEO metadata, and real error states. If chatbot is enabled, include app/api/chat/route.ts using only the client-owned AI credential. Never put secrets in NEXT_PUBLIC_* or source files.';
      let generated = await ai.chat.completions.create({ model:getConfiguredModel(), messages:[{role:'system',content:baseSystem},{role:'user',content:prompt}], max_tokens:16000 });
      let content = generated.choices[0]?.message?.content || '';
      json = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as GeneratedSite;
      buildContext.stage = 'testing';
      await recordBuildState(buildContext, 'testing', 'Checking generated project files');
      let missing = validateGeneratedSite(json, Boolean(body.chatbot_enabled));
      if (missing.length) {
        generated = await ai.chat.completions.create({ model:getConfiguredModel(), messages:[{role:'system',content:baseSystem},{role:'user',content:`Your previous output was incomplete. These required files were missing: ${missing.join(', ')}. Return a corrected complete JSON project. Original request:\n${prompt}`}], max_tokens:18000 });
        content = generated.choices[0]?.message?.content || '';
        json = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as GeneratedSite;
        missing = validateGeneratedSite(json, Boolean(body.chatbot_enabled));
      }
      if (missing.length) return NextResponse.json({error:`Generated project is incomplete. Missing required files: ${missing.join(', ')}`},{status:422});
    }

    buildContext.stage = 'building';
    await recordBuildState(buildContext, 'building', 'Creating isolated customer repository');
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
    if (customDomain) {
      const domainResult = await vercel(`/v9/projects/${encodeURIComponent(projectId)}/domains`);
      const attachedDomainNames = new Set<string>(
        (Array.isArray(domainResult.domains) ? domainResult.domains : []).flatMap((entry: { name?: unknown }) => {
          const domain = normalizeVercelDomain(entry.name);
          return domain ? [domain] : [];
        }),
      );
      if (!attachedDomainNames.has(customDomain)) {
        await vercel(`/v10/projects/${encodeURIComponent(projectId)}/domains`, {
          method: 'POST',
          body: JSON.stringify({ domain: customDomain }),
        });
      }
    }

    buildContext.stage = 'deploying';
    await recordBuildState(buildContext, 'deploying', 'Submitting production deployment to Vercel');
    const files = (json.files || []).map((f) => ({ file: f.path, data: f.content }));
    const deploy = await vercel('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, project: projectId, files, projectSettings: { framework: 'nextjs' }, target: 'production' }),
    });

    const deploymentId = String(deploy.id || deploy.uid || '');
    if (!deploymentId) throw new Error('Vercel did not return a deployment ID.');
    const readyDeployment = await waitForVercelDeployment(deploymentId, 180000, (state) =>
      recordBuildState(buildContext!, 'deploying', `Vercel build state: ${state}`),
    );
    await recordBuildState(buildContext, 'deploying', 'Verifying the project’s main production domain');
    const projectDomainsResult = await vercel(`/v9/projects/${encodeURIComponent(projectId)}/domains`);
    const projectDomains = Array.isArray(projectDomainsResult.domains) ? projectDomainsResult.domains : [];
    const businessSubdomain = toVercelSubdomain(body.client_name || ownedProject.business_name);
    const compactBusinessSubdomain = businessSubdomain?.replaceAll('-', '');
    const mainUrl = resolveVerifiedVercelMainUrl(projectDomains, [
      customDomain,
      businessSubdomain ? `${businessSubdomain}.vercel.app` : null,
      compactBusinessSubdomain ? `${compactBusinessSubdomain}.vercel.app` : null,
      `${String(project.name || repoName)}.vercel.app`,
    ]);
    if (!mainUrl) {
      mainDomainFailure = 'Vercel reports the deployment ready, but no verified main project domain is attached. Add and verify the project’s production domain in Vercel. LeonardX will not return a per-deployment preview URL.';
      throw new Error(mainDomainFailure);
    }
    const verifiedDomainHosts = new Set<string>(
      projectDomains.flatMap((entry: { name?: unknown; verified?: unknown }) => {
        if (entry.verified !== true && entry.verified !== 'true') return [];
        const domain = normalizeVercelDomain(entry.name);
        return domain ? [domain] : [];
      }),
    );
    try {
      await verifyPublicMainDomain(mainUrl, verifiedDomainHosts);
    } catch (error) {
      mainDomainFailure = error instanceof Error && error.message === 'VERCEL_DEPLOYMENT_PROTECTION'
        ? 'Vercel is redirecting the main production domain to sign-in. Disable Deployment Protection for the production domain, then retry. LeonardX will not return the protected deployment URL.'
        : 'Vercel reports the build ready, but the verified main domain is not publicly reachable yet. Check its domain assignment and DNS, then retry.';
      throw new Error(mainDomainFailure);
    }
    const liveUrl = mainUrl;
    deploymentUrl = liveUrl;
    buildContext.stage = 'live';
    await recordBuildState(buildContext, 'live', 'Vercel confirmed deployment READY', {
      deploymentId,
      deploymentUrl: liveUrl,
      message: 'Vercel confirmed the project deployment is ready.',
    });

    let hostingTrialError: string | null = null;
    if (customerProjectId) {
      const now = new Date();
      await db.from('website_projects').update({
        status: 'deployed',
        hosting_enforcement_status: 'active',
        github_repo: repo.html_url,
        vercel_project_id: projectId,
        live_deployment_id: deploymentId || null,
        suspended_deployment_id: null,
        live_url: liveUrl,
        admin_url: `${liveUrl}/admin`,
        client_name: body.client_name || null,
        client_email: body.client_email || null,
        client_whatsapp: body.client_whatsapp || null,
        custom_domain: customDomain,
        updated_at: now.toISOString(),
      }).eq('id', customerProjectId).eq('owner_user_id', ctx.user.id);

      const { error: trialError } = await db.rpc('start_project_hosting_trial', {
        p_project_id: customerProjectId,
        p_owner_user_id: ctx.user.id,
        p_client_email: String(body.client_email || ctx.profile.email || ''),
        p_trial_days: Number(process.env.HOSTING_TRIAL_DAYS || 90),
      });
      if (trialError) {
        hostingTrialError = trialError.message;
        console.error('Deployment is live but hosting trial setup failed:', trialError.message);
      }
    }

    const { error: deploymentEventError } = await db.from('deployment_events').insert({
      website_project_id: customerProjectId,
      event_type: 'deploy',
      status: 'success',
      message: 'Deployment submitted to Vercel',
      metadata: {
        repo: repo.html_url,
        vercel: liveUrl,
        deploymentId,
        publicKeys: Object.keys(publicEnv),
        secretKeys: Object.keys(secretEnv),
        missingRequirements: json.missingRequirements || [],
      },
    });
    if (deploymentEventError) console.error('Could not record deployment event:', deploymentEventError.message);

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
      adminUrl: `${liveUrl}/admin`,
      missingRequirements: json.missingRequirements || [],
      hostingTrialError,
      reviewUrl: wallOfLoveUrl,
    });
  } catch (e) {
    reportFailure(e, buildContext?.stage === 'deploying' || buildContext?.stage === 'live'
      ? 'vercel'
      : mcpExternalModel ? 'github' : 'openai');
    if (buildContext?.stage === 'live') {
      return NextResponse.json({ status: 'deployed', liveUrl: deploymentUrl, warning: 'Deployment is live, but project status could not be fully recorded.' });
    }
    if (buildContext) {
      const status = buildContext.stage === 'deploying' ? 'deploy_failed' : 'build_failed';
      await recordBuildState(buildContext, status, status === 'deploy_failed' ? 'Deployment failed' : 'Build failed', {
        error: mainDomainFailure || 'Build or deployment operation failed.',
        message: mainDomainFailure || 'Build or deployment operation failed.',
      }).catch(() => console.error(JSON.stringify({ level: 'error', event: 'leo.operation.persistence_failure', operation: 'project.build_deploy', request_id: requestId })));
    }
    return NextResponse.json({
      error: mainDomainFailure || 'Build or deployment could not be completed. Review the project operation status and retry.',
    }, { status: mainDomainFailure ? 502 : 500 });
  }
  });
}
