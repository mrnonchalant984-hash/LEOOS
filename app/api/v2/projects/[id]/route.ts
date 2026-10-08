import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authenticateApiKey } from '@/lib/api-auth';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticateApiKey(req, 'read'); if ('error' in a) return a.error; const { id } = await params;
  const { data, error } = await adminSupabase().from('projects').select('id,project_name,type,status,progress,file_url,files,created_at').eq('id', id).eq('user_id', a.userId).maybeSingle();
  if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project could not be loaded.' }, request_id: a.requestId }, 500, a.requestId);
  if (!data) return apiResponse({ error: { code: 'NOT_FOUND', message: 'Project not found.' }, request_id: a.requestId }, 404, a.requestId);
  return apiResponse({ data, request_id: a.requestId }, 200, a.requestId);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticateApiKey(req, 'write'); if ('error' in a) return a.error; const { id } = await params; const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.project_name === 'string') patch.project_name = body.project_name.trim().slice(0, 120);
  if (typeof body.type === 'string') patch.type = body.type.trim().slice(0, 40);
  if (typeof body.status === 'string') patch.status = body.status.trim().slice(0, 40);
  if (typeof body.progress === 'number') patch.progress = Math.min(100, Math.max(0, Math.round(body.progress)));
  if (body.files && typeof body.files === 'object') patch.files = body.files;
  if (!Object.keys(patch).length) return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'No supported fields were provided.' }, request_id: a.requestId }, 400, a.requestId);
  const { data, error } = await adminSupabase().from('projects').update(patch).eq('id', id).eq('user_id', a.userId).select('id,project_name,type,status,progress,file_url,files,created_at').maybeSingle();
  if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project could not be updated.' }, request_id: a.requestId }, 500, a.requestId);
  if (!data) return apiResponse({ error: { code: 'NOT_FOUND', message: 'Project not found.' }, request_id: a.requestId }, 404, a.requestId);
  return apiResponse({ data, request_id: a.requestId }, 200, a.requestId);
}
