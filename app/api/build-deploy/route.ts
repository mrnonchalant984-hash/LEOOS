import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase, isPlatformOwner } from '@/lib/auth';
import { authenticateApiKey } from '@/lib/api-auth';
import { getDefaultTextModel } from '@/lib/ai/model-catalog';
import { generateText } from '@/lib/ai/provider-registry';
import { generateWithExplicitFallback, getSafeFallbackModel } from '@/lib/ai/provider-fallback';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import type { ProjectType } from '@/lib/pricing';
import { getBuilderAvailability, getExternalModelBuilderAvailability } from '@/lib/builders/providers';
import { withOperationalMonitoring } from '@/lib/monitoring';
import { validateMcpAccessToken, MCP_WRITE_SCOPE } from '@/lib/mcp/oauth';
import { normalizeIdePath, validateIdeFiles } from '@/lib/ide-files';
import { normalizeVercelDomain, resolveVerifiedVercelMainUrl, toVercelSubdomain, verifyPublicMainDomain } from '@/lib/vercel-deployment-url';
import { buildDeployRequestHash, getBuildDeployRateLimitPerHour, resolveBuildDeployIdempotencyKey } from '@/lib/build-deploy-idempotency';
import { ProviderHttpError, requestProviderJson } from '@/lib/provider-http';
import { decryptMcpCredential } from '@/lib/mcp/outbound-security';
import type { DeploymentProvider } from '@/lib/provider-http';

export const runtime = 'nodejs';

type GeneratedFile = { path: string; content: string };

type GeneratedSite = { files: GeneratedFile[]; missingRequirements?: string[] };

function validateGeneratedSite(site: GeneratedSite, chatbot: boolean) {
  const paths = new Set((site.files || []).map(f => f.path.replace(/^\//, '')));
  const required = ['package.json', 'app/layout.tsx', 'app/page.tsx', 'app/admin/page.tsx', 'app/sitemap.ts', 'app/robots.ts'];
  if (chatbot) required.push('app/api/chat/route.ts');
  return required.filter(p => !paths.has(p));
}

  async function waitForVercelDeployment(id: string, token: string | undefined, timeoutMs = 180000, onState?: (state: string) => Promise<void>) {
  const started = Date.now();
    let previousState = '';
  while (Date.now() - started < timeoutMs) {
    const d = await vercel(`/v13/deployments/${encodeURIComponent(id)}`, {}, token);
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

async function gh(path: string, opts: RequestInit = {}, token: string | undefined = process.env.GITHUB_TOKEN) {
  return requestProviderJson<Record<string, any>>('github', `https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token || ''}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function vercel(path: string, opts: RequestInit = {}, token: string | undefined = process.env.VERCEL_TOKEN) {
  const query = token === process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  return requestProviderJson<Record<string, any>>('vercel', `https://api.vercel.com${path}${query}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token || ''}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function getCustomerProviderToken(userId: string, provider: 'github' | 'vercel'): Promise<string | undefined> {
  const { data, error } = await adminSupabase().from('user_integrations')
    .select('credential_ciphertext')
    .eq('user_id', userId).eq('provider', provider).eq('status', 'verified')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  // Keep existing platform-managed credentials as a compatibility fallback if a customer has
  // not connected their own account. Never use a connection belonging to another user.
  if (error || !data?.credential_ciphertext) return provider === 'github' ? process.env.GITHUB_TOKEN : process.env.VERCEL_TOKEN;
  try {
    const config = JSON.parse(decryptMcpCredential(data.credential_ciphertext)) as Record<string, unknown>;
    const token = provider === 'github' || provider === 'vercel' ? config.token : undefined;
    if (typeof token !== 'string' || !token.trim()) throw new Error('Credential is missing.');
    return token;
  } catch {
    throw new Error(`The connected ${provider} credential could not be decrypted. Reconnect the integration before building.`);
  }
}

type BuildContext = { id: string; projectId: string; userId: string; deploymentId?: string | null };
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
  const buildUpdate: Record<string, unknown> = {
    status,
    step,
    logs: [...logs, { at: now, status, step, message: details.message || step }].slice(-100),
    error: details.error || null,
    completed_at: completed ? now : null,
  };
  if (details.deploymentId !== undefined) buildUpdate.deployment_id = details.deploymentId;
  if (details.deploymentUrl !== undefined) buildUpdate.deployment_url = details.deploymentUrl;
  const { error: buildError } = await db.from('project_builds').update(buildUpdate)
    .eq('id', context.id).eq('owner_user_id', context.userId);
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
    const parsedBody: unknown = await req.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'A deployment request body is required.' }, { status: 400 });
    }
    const body = parsedBody as Record<string, any>;
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
    const requestHash = buildDeployRequestHash(ctx.user.id, customerProjectId, body);
    const idempotency = resolveBuildDeployIdempotencyKey(req.headers.get('idempotency-key'), body.idempotency_key, requestHash);
    if (idempotency.error) return NextResponse.json({ error: idempotency.error }, { status: 400 });
    const { data: startedResult, error: startError } = await db.rpc('start_customer_project_build_idempotent', {
      p_project_id: customerProjectId,
      p_owner_user_id: ctx.user.id,
      p_provider: provider.id,
      p_monthly_limit: plan.limits.monthlyBuilds,
      p_idempotency_key: idempotency.key,
      p_request_hash: requestHash,
      p_request_limit: getBuildDeployRateLimitPerHour(),
      p_window_seconds: 3600,
    });
    if (startError) {
      const limited = startError.message?.includes('Monthly build limit reached');
      const idempotencyConflict = startError.message?.includes('Idempotency key is already associated');
      return NextResponse.json({
        error: limited
          ? 'The monthly build allowance for this plan has been reached.'
          : idempotencyConflict
            ? 'This idempotency key was already used for a different deployment request.'
            : 'Build could not be started.',
        code: limited ? 'MONTHLY_BUILD_LIMIT_REACHED' : idempotencyConflict ? 'IDEMPOTENCY_KEY_REUSED' : 'BUILD_START_FAILED',
        retryable: false,
        requestId,
        ...(limited ? { upgrade_url: '/pricing' } : {}),
      }, { status: limited ? 429 : idempotencyConflict ? 409 : 500, headers: { 'Cache-Control': 'no-store' } });
    }
    const admission = Array.isArray(startedResult) ? startedResult[0] : startedResult;
    if (!admission?.disposition) {
      return NextResponse.json({ error: 'Build admission could not be confirmed.', code: 'BUILD_START_FAILED', retryable: true, requestId }, { status: 503 });
    }
    if (admission.disposition === 'rate_limited') {
      const retryAfterSeconds = Number(admission.retry_after_seconds);
      const headers = new Headers({ 'Cache-Control': 'no-store' });
      if (Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0) headers.set('Retry-After', String(retryAfterSeconds));
      return NextResponse.json({
        error: 'The deployment service is protecting this account from too many new builds.',
        code: 'RATE_LIMITED',
        retryable: true,
        ...(Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
        provider: 'leonardx',
        requestId,
      }, { status: 429, headers });
    }
    if (admission.disposition === 'in_progress') {
      return NextResponse.json({
        error: 'A different build is already running for this project. Check its status before starting another version.',
        code: 'BUILD_ALREADY_RUNNING',
        retryable: true,
        jobId: admission.build_id,
        status: admission.build_status,
        requestId,
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    if (admission.disposition === 'duplicate') {
      const { data: existingBuild, error: existingError } = await db.from('project_builds')
        .select('id,status,step,error,deployment_id,deployment_url,created_at,started_at,completed_at')
        .eq('id', admission.build_id)
        .eq('owner_user_id', ctx.user.id)
        .eq('website_project_id', customerProjectId)
        .maybeSingle();
      if (existingError || !existingBuild) {
        return NextResponse.json({ error: 'The existing build status could not be loaded.', code: 'BUILD_STATUS_UNAVAILABLE', retryable: true, requestId }, { status: 503 });
      }
      const responseBody = { jobId: existingBuild.id, status: existingBuild.status, step: existingBuild.step, duplicate: true, requestId };
      if (['building', 'testing', 'deploying'].includes(existingBuild.status)) {
        return NextResponse.json({ ...responseBody, success: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
      }
      if (existingBuild.status === 'live') {
        return NextResponse.json({ ...responseBody, status: 'deployed', liveUrl: existingBuild.deployment_url, success: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      return NextResponse.json({
        ...responseBody,
        error: 'The earlier build for this idempotency key failed. Check its status before explicitly starting a new deployment.',
        code: 'PREVIOUS_BUILD_FAILED',
        retryable: false,
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    if (admission.disposition !== 'started' || !admission.build_id) {
      return NextResponse.json({ error: 'Build admission returned an unknown status.', code: 'BUILD_START_FAILED', retryable: true, requestId }, { status: 503 });
    }
    buildContext = { id: String(admission.build_id), projectId: customerProjectId, userId: ctx.user.id, stage: 'building' };
    const prompt = `Build a production-ready ${projectType.replaceAll('_', ' ')} named ${ownedProject.business_name || 'Customer Project'}.\n\n${userPrompt}`;

    let json: GeneratedSite;
    if (suppliedMcpFiles) {
      json = { files: suppliedMcpFiles };
    } else {
      const primaryModel = process.env.LEO_BUILD_MODEL?.trim() || getDefaultTextModel('chat');
      const fallbackModel = getSafeFallbackModel(primaryModel, process.env.LEO_FALLBACK_MODEL?.trim());
      const baseSystem = 'Generate a coherent, tailored, production-oriented Next.js App Router website from the user’s requirements. Do not use a generic one-page template when the brief calls for a real multi-page product. Return ONLY JSON: {"files":[{"path":"...","content":"..."}],"missingRequirements":["..."]}. Follow the requested brand, design system, navigation, pages, content hierarchy, responsive behavior and accessibility requirements. Do not invent client facts. Use clearly marked placeholders only where the client has not supplied required assets, and list every missing asset in missingRequirements. The output MUST include package.json, app/layout.tsx, app/page.tsx, app/admin/page.tsx, app/sitemap.ts, app/robots.ts, secure server-side environment handling, a client-friendly admin area relevant to the selected website type, SEO metadata, and real error states. If chatbot is enabled, include app/api/chat/route.ts using only the client-owned AI credential. Never put secrets in NEXT_PUBLIC_* or source files.';
      const generateSite = async (userPrompt: string) => {
        const messages = [{ role: 'system' as const, content: baseSystem }, { role: 'user' as const, content: userPrompt }];
        let outcome = await generateWithExplicitFallback(primaryModel, fallbackModel, model => generateText({ model, messages, maxOutputTokens: 16000, temperature: 0.2 }));
        if (fallbackModel && !outcome.fallback_used) {
          try { JSON.parse(outcome.result.text.replace(/^```json\s*|```$/g, '')); }
          catch {
            // A provider can return a healthy HTTP response with malformed JSON.
            // Treat that as a generation failure and try the configured fallback once.
            const fallback = await generateText({ model: fallbackModel, messages, maxOutputTokens: 16000, temperature: 0.2 });
            outcome = { result: fallback, model: fallbackModel, fallback_used: true };
          }
        }
        return outcome;
      };
      let generated = await generateSite(prompt);
      let content = generated.result.text || '';
      json = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as GeneratedSite;
      buildContext.stage = 'testing';
      await recordBuildState(buildContext, 'testing', `Checking generated project files (${generated.model})`);
      let missing = validateGeneratedSite(json, Boolean(body.chatbot_enabled));
      if (missing.length) {
        generated = await generateSite(`Your previous output was incomplete. These required files were missing: ${missing.join(', ')}. Return a corrected complete JSON project. Original request:\n${prompt}`);
        content = generated.result.text || '';
        json = JSON.parse(content.replace(/^```json\s*|```$/g, '')) as GeneratedSite;
        missing = validateGeneratedSite(json, Boolean(body.chatbot_enabled));
      }
      if (missing.length) return NextResponse.json({error:`Generated project is incomplete. Missing required files: ${missing.join(', ')}`},{status:422});
    }

    buildContext.stage = 'building';
    await recordBuildState(buildContext, 'building', 'Creating isolated customer repository');
    const githubToken = await getCustomerProviderToken(ctx.user.id, 'github');
    const vercelToken = await getCustomerProviderToken(ctx.user.id, 'vercel');
    if (!githubToken || !vercelToken) throw new Error('Connect verified GitHub and Vercel accounts in Integrations, or configure the platform-managed fallback credentials.');
    const me = await gh('/user', {}, githubToken);
    const repoName = `${process.env.VERCEL_PROJECT_PREFIX || 'leo-site'}-${Date.now()}`;
    const repo = await gh('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, private: true, description: `Website generated by LEO for ${ctx.profile.email}`, auto_init: true }),
    }, githubToken);
    const ref = await gh(`/repos/${me.login}/${repoName}/git/ref/heads/main`, {}, githubToken);
    const base = ref.object.sha;
    const baseCommit = await gh(`/repos/${me.login}/${repoName}/git/commits/${base}`, {}, githubToken);
    const blobs = await Promise.all((json.files || []).map(async (f) => {
      const b = await gh(`/repos/${me.login}/${repoName}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
      }, githubToken);
      return { path: f.path, mode: '100644', type: 'blob', sha: b.sha };
    }));
    const tree = await gh(`/repos/${me.login}/${repoName}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
    }, githubToken);
    const commit = await gh(`/repos/${me.login}/${repoName}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Create website with LeonardX', tree: tree.sha, parents: [base] }),
    }, githubToken);
    await gh(`/repos/${me.login}/${repoName}/git/refs/heads/main`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    }, githubToken);

    const publicEnv: Record<string, string> = {};
    const secretEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.env || {})) {
      if (typeof v !== 'string' || !v) continue;
      (k.startsWith('NEXT_PUBLIC_') ? publicEnv : secretEnv)[k] = v;
    }

    const project = await vercel('/v10/projects', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, framework: 'nextjs', gitRepository: { type: 'github', repo: `${me.login}/${repoName}` } }),
    }, vercelToken).catch(async (e) => {
      const existing = await vercel(`/v9/projects/${encodeURIComponent(repoName)}`, {}, vercelToken).catch(() => null);
      if (existing) return existing;
      throw e;
    });
    const projectId = String(project.id || project.name || repoName);
    for (const [key, value] of Object.entries({ ...publicEnv, ...secretEnv })) {
      await vercel(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
        method: 'POST',
        body: JSON.stringify({ key, value, type: publicEnv[key] ? 'plain' : 'secret', target: ['production', 'preview', 'development'] }),
      }, vercelToken);
    }
    if (customDomain) {
      const domainResult = await vercel(`/v9/projects/${encodeURIComponent(projectId)}/domains`, {}, vercelToken);
      const attachedDomainNames = new Set<string>(
        (Array.isArray(domainResult.domains) ? domainResult.domains : []).flatMap((entry: { name?: unknown }) => {
          const domain = normalizeVercelDomain(entry.name);
          return domain ? [domain] : [];
        }),
      );
      if (!attachedDomainNames.has(customDomain)) {
        await vercel(`/v10/projects/${encodeURIComponent(projectId)}/domains`, {
          method: 'POST',
          body: JSON.stringify({ name: customDomain }),
        }, vercelToken);
      }
    }

    buildContext.stage = 'deploying';
    await recordBuildState(buildContext, 'deploying', 'Submitting production deployment to Vercel');
    const files = (json.files || []).map((f) => ({ file: f.path, data: f.content }));
    const deploy = await vercel('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({ name: repoName, project: projectId, files, projectSettings: { framework: 'nextjs' }, target: 'production' }),
    }, vercelToken);

    const deploymentId = String(deploy.id || deploy.uid || '');
    if (!deploymentId) throw new Error('Vercel did not return a deployment ID.');
    buildContext.deploymentId = deploymentId;
    await recordBuildState(buildContext, 'deploying', 'Vercel accepted the production deployment', {
      deploymentId,
      message: 'Vercel accepted the production deployment and returned a deployment ID.',
    });
    await waitForVercelDeployment(deploymentId, vercelToken, 180000, (state) =>
      recordBuildState(buildContext!, 'deploying', `Vercel build state: ${state}`, { deploymentId }),
    );
    await recordBuildState(buildContext, 'deploying', 'Verifying the project’s main production domain');
    const projectDomainsResult = await vercel(`/v9/projects/${encodeURIComponent(projectId)}/domains`, {}, vercelToken);
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
      success: true,
      status: 'deployed',
      jobId: buildContext.id,
      githubUrl: repo.html_url,
      liveUrl,
      adminUrl: `${liveUrl}/admin`,
      missingRequirements: json.missingRequirements || [],
      hostingTrialError,
      reviewUrl: wallOfLoveUrl,
    });
  } catch (e) {
    const providerError = e instanceof ProviderHttpError ? e : null;
    const failureProvider: DeploymentProvider | 'openai' = providerError?.provider || (buildContext?.stage === 'deploying' || buildContext?.stage === 'live'
      ? 'vercel'
      : mcpExternalModel ? 'github' : 'openai');
    reportFailure(e, failureProvider === 'openai' ? undefined : failureProvider);
    if (providerError) {
      console.warn(JSON.stringify({
        level: 'warn',
        event: providerError.code === 'RATE_LIMITED' ? 'leo.provider.rate_limited' : 'leo.provider.request_failed',
        provider: providerError.provider,
        provider_status: providerError.status,
        error_code: providerError.code,
        retry_after_seconds: providerError.retryAfterSeconds,
        provider_request_id: providerError.providerRequestId,
        request_id: requestId,
        job_id: buildContext?.id,
      }));
    }
    if (buildContext?.stage === 'live') {
      return NextResponse.json({ status: 'deployed', liveUrl: deploymentUrl, warning: 'Deployment is live, but project status could not be fully recorded.' });
    }
    if (buildContext) {
      const status = buildContext.stage === 'deploying' ? 'deploy_failed' : 'build_failed';
      await recordBuildState(buildContext, status, status === 'deploy_failed' ? 'Deployment failed' : 'Build failed', {
        error: mainDomainFailure || providerError?.message || 'Build or deployment operation failed.',
        message: mainDomainFailure || providerError?.message || 'Build or deployment operation failed.',
        deploymentId: buildContext.deploymentId,
      }).catch(() => console.error(JSON.stringify({ level: 'error', event: 'leo.operation.persistence_failure', operation: 'project.build_deploy', request_id: requestId })));
    }
    if (providerError) {
      const responseStatus = providerError.code === 'RATE_LIMITED' || providerError.code === 'QUOTA_EXHAUSTED'
        ? 429
        : providerError.retryable ? 503 : 502;
      const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Request-ID': requestId });
      if (providerError.retryAfterSeconds !== null && providerError.retryAfterSeconds > 0) {
        headers.set('Retry-After', String(providerError.retryAfterSeconds));
      }
      return NextResponse.json({
        error: providerError.message,
        code: providerError.code,
        retryable: providerError.retryable,
        ...(providerError.retryAfterSeconds !== null ? { retryAfterSeconds: providerError.retryAfterSeconds } : {}),
        provider: providerError.provider,
        requestId,
        ...(buildContext ? { jobId: buildContext.id } : {}),
      }, { status: responseStatus, headers });
    }
    return NextResponse.json({
      error: mainDomainFailure || 'Build or deployment could not be completed. Review the project operation status and retry.',
      code: mainDomainFailure ? 'DEPLOYMENT_DOMAIN_UNAVAILABLE' : 'BUILD_DEPLOY_FAILED',
      retryable: false,
      requestId,
      ...(buildContext ? { jobId: buildContext.id } : {}),
    }, { status: mainDomainFailure ? 502 : 500, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId } });
  }
  });
}
