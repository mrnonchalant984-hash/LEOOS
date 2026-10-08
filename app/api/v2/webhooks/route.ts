import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authenticateApiKey } from '@/lib/api-auth';
import { encryptSecret, hashSecret, isSafeWebhookUrl } from '@/lib/api-security';

export async function GET(req: NextRequest) {
  const a = await authenticateApiKey(req, 'read'); if ('error' in a) return a.error;
  const { data, error } = await adminSupabase().from('webhooks').select('id,name,endpoint_url,events,active,created_at,updated_at').eq('user_id', a.userId).order('created_at', { ascending: false });
  if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Webhooks could not be loaded.' }, request_id: a.requestId }, 500, a.requestId);
  return apiResponse({ data: data || [], request_id: a.requestId }, 200, a.requestId);
}

export async function POST(req: NextRequest) {
  const a = await authenticateApiKey(req, 'write'); if ('error' in a) return a.error;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const endpoint_url = typeof body.endpoint_url === 'string' ? body.endpoint_url.trim() : '';
  const events = Array.isArray(body.events) ? [...new Set(body.events.filter((x: unknown): x is string => typeof x === 'string').map((x: string) => x.trim()).filter(Boolean))].slice(0, 50) : [];
  if (!name || !isSafeWebhookUrl(endpoint_url)) return apiResponse({ error: { code: 'VALIDATION_ERROR', message: 'A valid HTTPS public endpoint_url is required.' }, request_id: a.requestId }, 400, a.requestId);
  let secret: string;
  try { secret = `whsec_${randomBytes(32).toString('base64url')}`; } catch { return apiResponse({ error: { code: 'CRYPTO_ERROR', message: 'Could not generate a webhook secret.' }, request_id: a.requestId }, 500, a.requestId); }
  try {
    const { data, error } = await adminSupabase().from('webhooks').insert({ user_id: a.userId, name, endpoint_url, events, active: true, secret_hash: hashSecret(secret), secret_encrypted: encryptSecret(secret) }).select('id,name,endpoint_url,events,active,created_at,updated_at').single();
    if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Webhook could not be created.' }, request_id: a.requestId }, 500, a.requestId);
    return apiResponse({ data, secret, warning: 'Store this secret securely. It will not be shown again.' }, 201, a.requestId);
  } catch (e) { return apiResponse({ error: { code: 'CONFIGURATION_ERROR', message: e instanceof Error ? e.message : 'Webhook encryption is not configured.' }, request_id: a.requestId }, 503, a.requestId); }
}
