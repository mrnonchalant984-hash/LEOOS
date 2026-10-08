import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, authenticateApiKey } from '@/lib/api-auth';
import { decryptSecret, isSafeWebhookUrl } from '@/lib/api-security';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticateApiKey(req, 'write'); if ('error' in a) return a.error;
  const { id } = await params;
  const { data: w } = await adminSupabase().from('webhooks').select('id,endpoint_url,secret_encrypted').eq('id', id).eq('user_id', a.userId).maybeSingle();
  if (!w) return apiResponse({ error: { code: 'NOT_FOUND', message: 'Webhook not found.' }, request_id: a.requestId }, 404, a.requestId);
  if (!w.secret_encrypted || !isSafeWebhookUrl(w.endpoint_url)) return apiResponse({ error: { code: 'WEBHOOK_NOT_READY', message: 'Rotate this webhook before testing it.' }, request_id: a.requestId }, 409, a.requestId);
  try {
    const secret = decryptSecret(w.secret_encrypted);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({ type: 'leo.test', id: a.requestId, created_at: new Date().toISOString(), data: { message: 'LEO OS webhook test' } });
    const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    const started = Date.now();
    const response = await fetch(w.endpoint_url, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'user-agent': 'LEO-OS-Webhooks/2.0', 'x-leo-event': 'leo.test', 'x-leo-timestamp': timestamp, 'x-leo-signature': `v1=${signature}`, 'x-leo-request-id': a.requestId }, body: payload, signal: AbortSignal.timeout(10000) });
    const text = (await response.text()).slice(0, 4000);
    await adminSupabase().from('webhook_deliveries').insert({ webhook_id: id, event_type: 'leo.test', status: response.ok ? 'delivered' : 'failed', attempt: 1, response_code: response.status, response_body: text, delivered_at: response.ok ? new Date().toISOString() : null });
    return apiResponse({ data: { delivered: response.ok, status_code: response.status, latency_ms: Date.now() - started }, request_id: a.requestId }, response.ok ? 200 : 502, a.requestId);
  } catch (e) {
    await adminSupabase().from('webhook_deliveries').insert({ webhook_id: id, event_type: 'leo.test', status: 'failed', attempt: 1, response_body: e instanceof Error ? e.message.slice(0, 4000) : 'Delivery failed' });
    return apiResponse({ error: { code: 'DELIVERY_FAILED', message: 'Webhook test delivery failed.' }, request_id: a.requestId }, 502, a.requestId);
  }
}
