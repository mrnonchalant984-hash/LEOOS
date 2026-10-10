import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, withApiKey } from '@/lib/api-auth';

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
    const body = await req.json().catch(() => ({}));
    const name = typeof body.project_name === 'string' ? body.project_name.trim().slice(0, 120) : '';
    if (!name) return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'project_name is required.' }, request_id: auth.requestId }, 400, auth.requestId);
    const type = typeof body.type === 'string' ? body.type.trim().slice(0, 40) : 'web_app';
    const { data, error } = await adminSupabase().from('projects')
      .insert({ user_id: auth.userId, project_name: name, type, status: 'draft', progress: 0, files: {} })
      .select('id,project_name,type,status,progress,file_url,created_at')
      .single();
    if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project could not be created.' }, request_id: auth.requestId }, 500, auth.requestId);
    return apiResponse({ data, request_id: auth.requestId }, 201, auth.requestId);
  });
}
