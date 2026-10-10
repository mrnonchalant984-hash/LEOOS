import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, withApiKey } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  return withApiKey(req, 'read', async (auth) => {
    const { data, error } = await adminSupabase().from('ai_usage')
      .select('feature,model,total_tokens,credits_used,created_at')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Usage could not be loaded.' }, request_id: auth.requestId }, 500, auth.requestId);
    return apiResponse({ data: data || [], request_id: auth.requestId }, 200, auth.requestId);
  });
}
