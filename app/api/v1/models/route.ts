import { NextRequest } from 'next/server';
import { apiResponse, withApiKey } from '@/lib/api-auth';

export const runtime = 'nodejs';

function supportedModels() {
  const configured = (process.env.LEONARDX_API_MODELS || 'gpt-4o-mini')
    .split(',').map((model) => model.trim()).filter((model) => /^[a-zA-Z0-9._-]{1,80}$/.test(model));
  return [...new Set(configured.length ? configured : ['gpt-4o-mini'])];
}

export async function GET(req: NextRequest) {
  return withApiKey(req, 'read', async (auth) => {
    if (!process.env.OPENAI_API_KEY) return apiResponse({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Model access is temporarily unavailable.' }, request_id: auth.requestId }, 503, auth.requestId);
    return apiResponse({
    data: supportedModels().map((id) => ({ id, object: 'model', owned_by: 'leonardx' })),
    request_id: auth.requestId,
    }, 200, auth.requestId);
  });
}
