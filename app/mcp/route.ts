import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getMcpBaseUrl, isAllowedMcpOrigin, MCP_SCOPE, validateMcpAccessToken } from '@/lib/mcp/oauth';
import { handleUserMcpRequest } from '@/lib/mcp/server';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import { isPlatformOwner } from '@/lib/auth';
import type { ProjectType } from '@/lib/pricing';
import { normalizeIdePath, validateIdeFiles } from '@/lib/ide-files';
import { POST as buildDeploy } from '@/app/api/build-deploy/route';

async function invokeCloudBuildRoute(
  request: NextRequest,
  provider: 'expo-eas' | 'godot-build-service',
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  jobId?: string,
) {
  const authorization = request.headers.get('authorization');
  if (!authorization) return { data: null, error: 'MCP authorization is missing.' };
  const apiUrl = new URL(`/api/builds/${provider === 'expo-eas' ? 'expo' : 'godot'}${jobId ? `/${encodeURIComponent(jobId)}` : ''}`, request.url);
  const apiRequest = new NextRequest(apiUrl, {
    method,
    headers: { Authorization: authorization, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = provider === 'expo-eas'
    ? await (method === 'POST'
      ? (await import('@/app/api/builds/expo/route')).POST(apiRequest)
      : (await import('@/app/api/builds/expo/[id]/route')).GET(apiRequest, { params: Promise.resolve({ id: jobId || '' }) }))
    : await (method === 'POST'
      ? (await import('@/app/api/builds/godot/route')).POST(apiRequest)
      : (await import('@/app/api/builds/godot/[id]/route')).GET(apiRequest, { params: Promise.resolve({ id: jobId || '' }) }));
  const data = await response.json().catch(() => null);
  return response.ok
    ? { data, error: null }
    : { data: null, error: typeof data?.error === 'string' ? data.error : `Cloud build request failed (${response.status}).` };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
    'Access-Control-Expose-Headers': 'MCP-Session-Id, WWW-Authenticate',
    'Vary': 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function unauthorized(request: NextRequest) {
  let resourceMetadata = '';
  try {
    resourceMetadata = `${getMcpBaseUrl(request)}/.well-known/oauth-protected-resource`;
  } catch {
    resourceMetadata = new URL('/.well-known/oauth-protected-resource', request.url).toString();
  }
  return NextResponse.json({ error: 'A valid OAuth access token is required.' }, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${resourceMetadata}", scope="${MCP_SCOPE}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isAllowedMcpOrigin(request.headers.get('origin'), request.url)) {
    return NextResponse.json({ error: 'The request origin is not allowed.' }, { status: 403 });
  }
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    return NextResponse.json({ error: 'Streamable HTTP clients must accept application/json and text/event-stream.' }, { status: 406 });
  }
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,256})$/i.exec(authorization);
  if (!match) return unauthorized(request);
  try {
    const token = await validateMcpAccessToken(match[1]);
    if (!token) return unauthorized(request);
    const db = adminSupabase();
    const projects = {
      async getAccountPlan(userId: string) {
        const [
          { data: profile, error: profileError },
          { count: projectCount, error: projectError },
          { count: buildsUsed, error: buildsError },
          { count: buildsPending, error: pendingError },
        ] = await Promise.all([
          db.from('profiles').select('role,email').eq('id', userId).maybeSingle(),
          db.from('website_projects').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId),
          db.from('project_builds').select('id', { count: 'exact', head: true })
            .eq('owner_user_id', userId)
            .eq('status', 'live')
            .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
          db.from('project_builds').select('id', { count: 'exact', head: true })
            .eq('owner_user_id', userId)
            .in('status', ['building', 'testing', 'deploying'])
            .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        ]);
        if (profileError || projectError || buildsError || pendingError || !profile) {
          return { data: null, error: profileError || projectError || buildsError || pendingError || new Error('Account profile is unavailable.') };
        }
        const plan = await getEffectiveUserPlan(userId, isPlatformOwner(profile));
        const used = buildsUsed || 0;
        const pending = buildsPending || 0;
        return {
          data: {
            plan: plan.key,
            project_types: plan.projectTypes,
            projects: { used: projectCount || 0, limit: plan.limits.maxProjects },
            monthly_builds: {
              used,
              pending,
              remaining: Math.max(0, plan.limits.monthlyBuilds - used - pending),
              limit: plan.limits.monthlyBuilds,
            },
            model_generation: 'performed by the connected MCP client; no LeonardX model or image-generation credits are used',
            uses_leonardx_ai_credits: false,
            hosting_trial: 'starts after a successful deployment is verified live',
            note: 'The connected Claude, ChatGPT, or other MCP client provides model inference. LeonardX charges one monthly build allowance only after a successful live deployment.',
          },
          error: null,
        };
      },
      async listProjects(userId: string, limit: number) {
        const { data, error } = await db.from('projects')
          .select('id,project_name,type,status,progress,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        return { data, error };
      },
      async getProject(userId: string, projectId: string) {
        const { data, error } = await db.from('projects')
          .select('id,project_name,type,status,progress,created_at')
          .eq('id', projectId)
          .eq('user_id', userId)
          .maybeSingle();
        return { data, error };
      },
      async getProjectFiles(userId: string, projectId: string, requestedPaths?: string[]) {
        const { data: project, error } = await db.from('projects').select('files')
          .eq('id', projectId).eq('user_id', userId).maybeSingle();
        if (error || !project) return { data: null, error: error || new Error('Project not found.') };
        const files = project.files;
        if (!validateIdeFiles(files)) return { data: null, error: new Error('Project workspace files are invalid.') };
        const wanted = requestedPaths ? new Set(requestedPaths) : null;
        const safeFiles = Object.fromEntries(Object.entries(files).filter(([file]) => {
          const lower = file.toLowerCase();
          return (!wanted || wanted.has(file)) && normalizeIdePath(file) === file &&
            !/(^|\/)\.env(?:\.|$)/i.test(file) &&
            !/(^|\/)(?:\.git|node_modules|\.next|\.godot)(\/|$)/i.test(file) &&
            !/\.(?:pem|key|p12|pfx|keystore)$/i.test(lower) &&
            !/(^|\/)(?:credentials|secrets?)\.(?:json|ya?ml)$/i.test(file);
        }));
        return { data: safeFiles, error: null };
      },
      async submitCloudBuild(_userId: string, input: {
        project_id: string;
        provider: 'expo-eas' | 'godot-build-service';
        platform?: 'android' | 'ios';
        profile?: 'preview' | 'production';
        preset?: string;
        idempotency_key: string;
      }) {
        const body = input.provider === 'expo-eas'
          ? { project_id: input.project_id, platform: input.platform, profile: input.profile, idempotency_key: input.idempotency_key }
          : { project_id: input.project_id, preset: input.preset, idempotency_key: input.idempotency_key };
        return invokeCloudBuildRoute(request, input.provider, 'POST', body);
      },
      async getCloudBuildStatus(_userId: string, provider: 'expo-eas' | 'godot-build-service', jobId: string) {
        return invokeCloudBuildRoute(request, provider, 'GET', undefined, jobId);
      },
      async getHostingStatus(userId: string, projectId: string) {
        const { data: project, error: projectError } = await db.from('website_projects')
          .select('id,status,live_url')
          .eq('source_project_id', projectId)
          .eq('owner_user_id', userId)
          .maybeSingle();
        if (projectError || !project) return { data: null, error: projectError || new Error('Project not found.') };
        const { data: hosting, error: hostingError } = await db.from('hosting_subscriptions')
          .select('plan,status,starts_at,ends_at,next_renewal_at')
          .eq('website_project_id', project.id)
          .maybeSingle();
        if (hostingError) return { data: null, error: hostingError };
        if (!hosting) {
          return {
            data: {
              deployment_status: project.status,
              live_url: project.live_url,
              trial_started: false,
              message: 'The hosting trial starts after Vercel confirms a successful live deployment.',
            },
            error: null,
          };
        }
        return {
          data: {
            deployment_status: project.status,
            live_url: project.live_url,
            hosting_plan: hosting.plan,
            hosting_status: hosting.status,
            trial_started: hosting.status === 'trial',
            starts_at: hosting.starts_at,
            ends_at: hosting.ends_at,
            next_renewal_at: hosting.next_renewal_at,
            days_remaining: Math.max(0, Math.ceil((new Date(hosting.ends_at).getTime() - Date.now()) / 86_400_000)),
          },
          error: null,
        };
      },
      async createProject(userId: string, name: string, projectType: ProjectType) {
        const [{ data: profile, error: profileError }, plan] = await Promise.all([
          db.from('profiles').select('role,email').eq('id', userId).maybeSingle(),
          getEffectiveUserPlan(userId),
        ]);
        if (profileError || !profile) return { data: null, error: profileError || new Error('Account profile is unavailable.') };
        const effectivePlan = isPlatformOwner(profile) ? await getEffectiveUserPlan(userId, true) : plan;
        const requiredFeature = projectType === 'saas' ? 'saas-builder' : projectType === 'web_app' ? 'web-app-builder' : 'website-builder';
        if (!effectivePlan.projectTypes.includes(projectType) || !planAllows(effectivePlan, requiredFeature)) {
          return { data: null, error: 'This project type is not included in your current plan. Review your plan at /pricing.' };
        }
        const { data: websiteProjectId, error: createError } = await db.rpc('create_customer_project', {
          p_owner_user_id: userId,
          p_project_type: projectType,
          p_website_type: projectType === 'website' ? 'company' : projectType,
          p_business_name: name,
          p_chatbot_enabled: false,
          p_payment_mode: 'manual_email',
          p_requirements: { source: 'mcp', ai_provider: 'connected_mcp_client' },
          p_project_limit: effectivePlan.limits.maxProjects,
        });
        if (createError || !websiteProjectId) {
          return { data: null, error: createError?.message || 'The project could not be created under this plan.' };
        }
        const { data: project, error: projectError } = await db.from('projects')
          .insert({ user_id: userId, project_name: name, type: projectType, status: 'draft', progress: 0, files: {} })
          .select('id,project_name,type,status,progress,created_at')
          .single();
        if (projectError || !project) {
          const { error: cleanupError } = await db.from('website_projects').delete()
            .eq('id', websiteProjectId).eq('owner_user_id', userId);
          if (cleanupError) return { data: null, error: 'The workspace could not be created and its plan-managed project record could not be cleaned up. Contact support before retrying.' };
          return { data: null, error: 'The project workspace could not be created.' };
        }
        const { error: linkError } = await db.from('website_projects').update({ source_project_id: project.id })
          .eq('id', websiteProjectId).eq('owner_user_id', userId);
        if (linkError) {
          const { error: projectCleanupError } = await db.from('projects').delete()
            .eq('id', project.id).eq('user_id', userId);
          const { error: websiteCleanupError } = await db.from('website_projects').delete()
            .eq('id', websiteProjectId).eq('owner_user_id', userId);
          if (projectCleanupError || websiteCleanupError) {
            return { data: null, error: 'The workspace link failed and cleanup was incomplete. Contact support before retrying.' };
          }
          return { data: null, error: 'The project workspace could not be linked to its build record.' };
        }
        return { data: { ...project, website_project_id: websiteProjectId }, error: null };
      },
      async saveProjectFiles(userId: string, projectId: string, files: Record<string, string>) {
        if (!validateIdeFiles(files)) return { data: null, error: 'Files must have safe workspace paths, be fewer than 250 files, and stay within the 2 MB workspace limit.' };
        const { data, error } = await db.from('projects').update({ files })
          .eq('id', projectId).eq('user_id', userId)
          .select('id,project_name,type,status,progress')
          .maybeSingle();
        if (error || !data) return { data: null, error: error || 'Project not found in this account.' };
        return { data: { ...data, files_saved: Object.keys(files).length }, error: null };
      },
      async renameProject(userId: string, projectId: string, name: string) {
        const { data, error } = await db.from('projects').update({ project_name: name })
          .eq('id', projectId).eq('user_id', userId)
          .select('id,project_name,type,status')
          .maybeSingle();
        if (error || !data) return { data: null, error: error || 'Project not found in this account.' };
        const { error: websiteError } = await db.from('website_projects').update({ business_name: name })
          .eq('source_project_id', projectId).eq('owner_user_id', userId);
        if (websiteError) return { data: null, error: 'The project was renamed, but its plan-managed build record could not be synchronized.' };
        return { data, error: null };
      },
      async buildAndDeploy(userId: string, projectId: string, brief: string, files: Array<{ path: string; content: string }>) {
        const fileMap = Object.fromEntries(files.map(file => [file.path, file.content]));
        if (Object.keys(fileMap).length !== files.length || !validateIdeFiles(fileMap)) {
          return { data: null, error: 'Deployment files contain duplicate/unsafe paths or exceed workspace file/size limits.' };
        }
        const { data: source, error: sourceError } = await db.from('projects')
          .select('id')
          .eq('id', projectId).eq('user_id', userId).maybeSingle();
        if (sourceError || !source) return { data: null, error: sourceError || 'Project not found in this account.' };
        const { data: websiteProject, error: websiteError } = await db.from('website_projects')
          .select('id')
          .eq('source_project_id', projectId).eq('owner_user_id', userId).maybeSingle();
        if (websiteError || !websiteProject) return { data: null, error: websiteError || 'The project has no plan-managed build workspace.' };
        const headers = new Headers(request.headers);
        headers.delete('content-length');
        const result = await buildDeploy(new NextRequest(new URL('/api/build-deploy', request.url), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            project_id: websiteProject.id,
            prompt: brief,
            generated_files: files,
            source: 'mcp_external_model',
          }),
        }));
        const resultBody = await result.json().catch(() => null);
        if (!result.ok) return { data: resultBody, error: resultBody?.error || `Deployment request failed with status ${result.status}.` };
        return { data: resultBody, error: null };
      },
      async getConfigurationStatus(_userId: string, target: 'development' | 'preview' | 'production' = 'production') {
        const { buildEnvStatusReport, missingRequiredEnvNames } = await import('@/lib/env-config-catalog');
        return {
          data: {
            target,
            variables: buildEnvStatusReport(target).map((item) => ({
              name: item.name,
              service: item.service,
              required: item.required,
              configured: item.configured,
              validationStatus: item.validationStatus,
              message: item.message,
            })),
            missingRequired: missingRequiredEnvNames(target),
            note: 'Secret values are never returned by MCP tools.',
          },
          error: null,
        };
      },
      async getEngineeringWorkflowStatus(userId: string, workflowId?: string) {
        const { listEngineeringWorkflows, getEngineeringWorkflow, serializeWorkflow, listWorkflowEvents } = await import('@/lib/engineering-workflow-store');
        if (workflowId) {
          const { data, error } = await getEngineeringWorkflow(userId, workflowId);
          if (error || !data) return { data: null, error: error || 'Workflow not found.' };
          const events = await listWorkflowEvents(userId, workflowId, 20);
          return { data: { workflow: serializeWorkflow(data), events: events.data }, error: null };
        }
        const { data, error } = await listEngineeringWorkflows(userId, 5);
        if (error) return { data: null, error };
        return { data: { workflows: data.map(serializeWorkflow) }, error: null };
      },
      async planEngineeringWorkflow(_userId: string, input: Parameters<typeof import('@/lib/mcp/orchestration').buildEngineeringOrchestrationPlan>[0]) {
        const { buildEngineeringOrchestrationPlan } = await import('@/lib/mcp/orchestration');
        return { data: buildEngineeringOrchestrationPlan(input), error: null };
      },
      async createEngineeringWorkflow(userId: string, input: {
        title: string;
        mode: 'discovery' | 'autonomous';
        applicability: Parameters<typeof import('@/lib/mcp/orchestration').buildEngineeringOrchestrationPlan>[0];
        project_id?: string;
        budget_tier?: string;
      }) {
        const { insertEngineeringWorkflow, serializeWorkflow } = await import('@/lib/engineering-workflow-store');
        const result = await insertEngineeringWorkflow({
          ownerUserId: userId,
          websiteProjectId: input.project_id || null,
          mode: input.mode,
          title: input.title,
          applicability: input.applicability,
          budgetTier: input.budget_tier || input.applicability.budgetTier || null,
        });
        return { data: result.data ? serializeWorkflow(result.data) : null, error: result.error };
      },
      async advanceEngineeringWorkflow(userId: string, input: {
        workflow_id: string;
        stage_id: import('@/lib/engineering-workflow').WorkflowStageId;
        status: import('@/lib/engineering-workflow').WorkflowStatus;
        progress_message?: string;
        artifacts?: Record<string, unknown>;
        error?: { code: string; message: string };
        confirm?: true;
      }) {
        const { advanceEngineeringWorkflowStage, serializeWorkflow } = await import('@/lib/engineering-workflow-store');
        const destructive = input.stage_id === 'MIGRATION_EXECUTION' || input.stage_id === 'DEPLOYMENT';
        if (destructive && input.status === 'COMPLETED' && input.confirm !== true) {
          return { data: null, error: 'Explicit confirmation is required for migration or deployment completion.' };
        }
        const result = await advanceEngineeringWorkflowStage(userId, input.workflow_id, input.stage_id, input.status, {
          progressMessage: input.progress_message,
          artifacts: input.artifacts,
          error: input.error,
        });
        return { data: result.data ? serializeWorkflow(result.data) : null, error: result.error };
      },
      async cancelEngineeringWorkflow(userId: string, workflowId: string) {
        const { cancelEngineeringWorkflow, serializeWorkflow } = await import('@/lib/engineering-workflow-store');
        const result = await cancelEngineeringWorkflow(userId, workflowId);
        return { data: result.data ? serializeWorkflow(result.data) : null, error: result.error };
      },
      async getCapabilityAlternatives(_userId: string, budget = 'free') {
        const {
          capabilityCatalog,
          detectExistingCapabilities,
          recommendOption,
        } = await import('@/lib/capability-alternatives');
        const existing = detectExistingCapabilities();
        const catalog = capabilityCatalog(existing);
        const tier = ['free', 'low', 'moderate', 'professional', 'custom'].includes(budget) ? budget : 'free';
        return {
          data: {
            budget: tier,
            requirements: catalog.map((requirement) => {
              const recommendation = recommendOption(requirement, tier as 'free' | 'low' | 'moderate' | 'professional' | 'custom');
              return {
                capability: requirement.capability,
                label: requirement.label,
                recommendation: recommendation.option
                  ? { id: recommendation.option.id, title: recommendation.option.title }
                  : null,
                reason: recommendation.reason,
              };
            }),
          },
          error: null,
        };
      },
    };
    const response = await handleUserMcpRequest(request, token.userId, token.scopes, projects);
    const headers = new Headers(response.headers);
    for (const [key, value] of corsHeaders(request)) headers.set(key, value);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error('MCP request failed:', error instanceof Error ? error.message : 'Unknown MCP error');
    return NextResponse.json({ error: 'The MCP request could not be completed.' }, { status: 503, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  if (!isAllowedMcpOrigin(request.headers.get('origin'), request.url)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
}
