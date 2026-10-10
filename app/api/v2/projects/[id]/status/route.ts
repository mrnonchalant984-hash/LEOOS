import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authenticateApiKey } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, 'read');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const { data, error } = await adminSupabase().from('projects')
    .select('id,project_name,type,status,progress,created_at')
    .eq('id', id).eq('user_id', auth.userId).maybeSingle();
  if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project status could not be loaded.' }, request_id: auth.requestId }, 500, auth.requestId);
  if (!data) return apiResponse({ error: { code: 'NOT_FOUND', message: 'Project not found.' }, request_id: auth.requestId }, 404, auth.requestId);
  return apiResponse({ data, request_id: auth.requestId }, 200, auth.requestId);
}
