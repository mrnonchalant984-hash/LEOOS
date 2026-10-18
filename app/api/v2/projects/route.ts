import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authenticateApiKey } from '@/lib/api-auth';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import { isPlatformOwner } from '@/lib/auth';
import type { ProjectType } from '@/lib/pricing';
export async function GET(req: NextRequest) {
  const a = await authenticateApiKey(req, 'read'); if ('error' in a) return a.error;
  const url = new URL(req.url); const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100); const status = url.searchParams.get('status');
  let q = adminSupabase().from('projects').select('id,project_name,type,status,progress,file_url,created_at').eq('user_id', a.userId).order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Projects could not be loaded.' }, request_id: a.requestId }, 500, a.requestId);
  return apiResponse({ data: data || [], meta: { limit, count: data?.length || 0 }, request_id: a.requestId }, 200, a.requestId);
}
export async function POST(req: NextRequest) {
  const a = await authenticateApiKey(req, 'write'); if ('error' in a) return a.error;
  const body = await req.json().catch(() => ({})); const name = typeof body.project_name === 'string' ? body.project_name.trim().slice(0, 120) : '';
  if (!name) return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'project_name is required.' }, request_id: a.requestId }, 400, a.requestId);
  const type = typeof body.type === 'string' ? body.type.trim() : 'web_app';
  const allowedTypes: ProjectType[] = ['website', 'web_app', 'saas', 'mobile_app', 'game'];
  if (!allowedTypes.includes(type as ProjectType)) return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'type must be a supported LeonardX project type.' }, request_id: a.requestId }, 400, a.requestId);
  const { data: profile, error: profileError } = await adminSupabase().from('profiles').select('role,email').eq('id', a.userId).maybeSingle();
  if (profileError || !profile) return apiResponse({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Account access could not be checked.' }, request_id: a.requestId }, 503, a.requestId);
  const owner = isPlatformOwner(profile);
  const plan = await getEffectiveUserPlan(a.userId, owner);
  const projectAllowed = type === 'mobile_app' || type === 'game'
    ? planAllowsCloudProject(plan, type, owner)
    : plan.projectTypes.includes(type as ProjectType);
  if (!projectAllowed) return apiResponse({ error: { code: 'PLAN_NOT_ENTITLED', message: 'This project type is not included in the current plan.' }, request_id: a.requestId }, 403, a.requestId);
  const { count, error: countError } = await adminSupabase().from('projects').select('id', { count: 'exact', head: true }).eq('user_id', a.userId);
  if (countError) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project capacity could not be checked.' }, request_id: a.requestId }, 503, a.requestId);
  if (!owner && (count || 0) >= plan.limits.maxProjects) return apiResponse({ error: { code: 'PROJECT_LIMIT_REACHED', message: 'Your plan project limit has been reached.' }, request_id: a.requestId }, 409, a.requestId);
  const { data, error } = await adminSupabase().from('projects').insert({ user_id: a.userId, project_name: name, type, status: 'draft', progress: 0, files: {} }).select('id,project_name,type,status,progress,file_url,created_at').single();
  if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project could not be created.' }, request_id: a.requestId }, 500, a.requestId);
  return apiResponse({ data, request_id: a.requestId }, 201, a.requestId);
}
