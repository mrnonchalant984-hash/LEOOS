import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, withApiKey } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  return withApiKey(req, 'read', async (auth) => {
    const { data, error } = await adminSupabase().from('profiles')
      .select('id,email,full_name,role,created_at')
      .eq('id', auth.userId)
      .maybeSingle();
    if (error || !data) return apiResponse({ error: { code: 'NOT_FOUND', message: 'API account not found.' }, request_id: auth.requestId }, 404, auth.requestId);
    return apiResponse({ data: { ...data, api_key_id: auth.keyId, scopes: auth.scopes }, request_id: auth.requestId }, 200, auth.requestId);
  });
}
