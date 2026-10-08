import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authenticateApiKey } from '@/lib/api-auth';
export async function GET(req: NextRequest) {
  const a = await authenticateApiKey(req, 'read'); if ('error' in a) return a.error;
  const { data, error } = await adminSupabase().from('profiles').select('id,email,full_name,role,created_at').eq('id', a.userId).maybeSingle();
  if (error || !data) return apiResponse({ error: { code: 'NOT_FOUND', message: 'API account not found.' }, request_id: a.requestId }, 404, a.requestId);
  return apiResponse({ data: { ...data, api_key_id: a.keyId, scopes: a.scopes }, request_id: a.requestId }, 200, a.requestId);
}
