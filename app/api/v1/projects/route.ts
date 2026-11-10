import { after, NextRequest } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { apiResponse, withApiKey } from '@/lib/api-auth';
import { emitWebhookEvent } from '@/lib/webhooks';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import type { ProjectType } from '@/lib/pricing';

export async function GET(req: NextRequest) {
  return withApiKey(req, 'read', async (auth) => {
    const { data, error } = await adminSupabase().from('projects')
      .select('id,project_name,type,status,progress,created_at')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Projects could not be loaded.' }, request_id: auth.requestId }, 500, auth.requestId);
    return apiResponse({ data: data || [], request_id: auth.requestId }, 200, auth.requestId);
  });
}

export async function POST(req: NextRequest) {
  return withApiKey(req, 'write', async (auth) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'Send a valid JSON object.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const name = typeof body.project_name === 'string' ? body.project_name.trim().slice(0, 120) : '';
    if (!name) return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'project_name is required.' }, request_id: auth.requestId }, 400, auth.requestId);
    const type = typeof body.type === 'string' ? body.type.trim() : 'web_app';
    const allowedTypes: ProjectType[] = ['website', 'web_app', 'saas', 'mobile_app', 'game'];
    if (!allowedTypes.includes(type as ProjectType)) {
      return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'type must be a supported LeonardX project type.' }, request_id: auth.requestId }, 400, auth.requestId);
    }
    const db = adminSupabase();
    const { data: profile, error: profileError } = await db.from('profiles').select('role,email').eq('id', auth.userId).maybeSingle();
    if (profileError || !profile) return apiResponse({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account access could not be checked.' }, request_id: auth.requestId }, 503, auth.requestId);
    const owner = isPlatformOwner(profile);
    const plan = await getEffectiveUserPlan(auth.userId, owner);
    const projectAllowed = type === 'mobile_app' || type === 'game'
      ? planAllowsCloudProject(plan, type, owner)
      : plan.projectTypes.includes(type as ProjectType);
    if (!projectAllowed) return apiResponse({ error: { code: 'PLAN_NOT_ENTITLED', message: 'This project type is not included in the current plan.' }, request_id: auth.requestId }, 403, auth.requestId);
    const { count, error: countError } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', auth.userId);
    if (countError) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project capacity could not be checked.' }, request_id: auth.requestId }, 503, auth.requestId);
    if (!owner && (count || 0) >= plan.limits.maxProjects) {
      return apiResponse({ error: { code: 'PROJECT_LIMIT_REACHED', message: 'Your plan project limit has been reached.' }, request_id: auth.requestId }, 409, auth.requestId);
    }
    const { data, error } = await db.from('projects')
      .insert({ user_id: auth.userId, project_name: name, type, status: 'draft', progress: 0, files: {} })
      .select('id,project_name,type,status,progress,file_url,created_at')
      .single();
    if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project could not be created.' }, request_id: auth.requestId }, 500, auth.requestId);
    after(async () => { try { await emitWebhookEvent(auth.userId, 'project.created', { project: data }); } catch { /* queued delivery retries handle transient failures */ } });
    return apiResponse({ data, request_id: auth.requestId }, 201, auth.requestId);
  });
}
