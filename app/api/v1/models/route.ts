import { NextRequest } from 'next/server';
import { apiResponse, withApiKey } from '@/lib/api-auth';
import { getSupportedApiModels } from '@/lib/api-plan-catalog';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return withApiKey(req, 'read', async (auth) => {
    if (!process.env.OPENAI_API_KEY) return apiResponse({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Model access is temporarily unavailable.' }, request_id: auth.requestId }, 503, auth.requestId);
    return apiResponse({
    data: getSupportedApiModels().map((id) => ({ id, object: 'model', owned_by: 'leonardx' })),
    request_id: auth.requestId,
    }, 200, auth.requestId);
  });
}
