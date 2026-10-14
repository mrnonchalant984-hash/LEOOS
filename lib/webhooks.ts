import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { MAX_ATTEMPTS, isPrivateIp, nextAttemptDelaySec, signatureHeader, staleDeliveryClaimCutoff, validateEndpointUrl, type WebhookEvent } from '@/lib/webhooks-core';

type Endpoint = { id: string; url: string; secret: string; active: boolean };
type Delivery = { id: string; endpoint_id: string; user_id: string; event: string; payload: unknown; attempts: number };

/** Sends HTTPS to a previously validated IP while preserving hostname TLS/SNI, preventing DNS-rebinding SSRF. */
async function sendPinnedWebhook(url: URL, addresses: Array<{ address: string; family: number }>, body: string, headers: Record<string, string>) {
  const pinnedLookup = ((hostname: string, options: unknown, callback: (...args: any[]) => void) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase() || !addresses.length) {
      callback(new Error('Webhook destination DNS validation failed.'));
      return;
    }
    const first = addresses[0];
    callback(null, first.address, first.family);
  }) as any;
  return await new Promise<number>((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:', hostname: url.hostname, port: 443,
      path: `${url.pathname}${url.search}`, method: 'POST', headers,
      lookup: pinnedLookup, servername: url.hostname, timeout: 8000,
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode || 0));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Webhook request timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

/** One real HTTP attempt. Records the outcome; schedules a retry or marks the delivery failed. Never throws. */
export async function attemptDelivery(d: Delivery, ep: Endpoint) {
  const db = adminSupabase();
  const attempts = d.attempts + 1;
  let status: number | null = null, error = '';
  try {
    const check = validateEndpointUrl(ep.url);
    if (!check.ok) throw new Error(check.reason);
    const addrs = await lookup(check.url.hostname, { all: true, verbatim: true });
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Host resolves to a private address.');
    const body = JSON.stringify(d.payload);
    status = await sendPinnedWebhook(check.url, addrs, body, {
      'content-type': 'application/json', 'user-agent': 'LeonardX-Webhooks/1.0',
      'leo-event': d.event, 'leo-delivery-id': d.id, 'leo-signature': signatureHeader(ep.secret, body),
      'content-length': String(Buffer.byteLength(body)),
    });
    if (status < 200 || status >= 300) error = `Endpoint responded with HTTP ${status}.`;
  } catch (e) { error = e instanceof Error ? e.message.slice(0, 300) : 'Delivery failed.'; }

  const ok = !error;
  const delay = ok ? null : nextAttemptDelaySec(attempts);
  await db.from('webhook_deliveries').update({
    attempts, response_status: status, last_error: ok ? null : error,
    status: ok ? 'succeeded' : delay === null ? 'failed' : 'pending',
    next_attempt_at: delay === null ? null : new Date(Date.now() + delay * 1000).toISOString(),
    delivered_at: ok ? new Date().toISOString() : null,
  }).eq('id', d.id);
  return { ok, status, error: ok ? null : error, attempts };
}

/** Queues the event for each of the user's active endpoints subscribed to it, and tries each once immediately. */
export async function emitWebhookEvent(userId: string, event: WebhookEvent, data: Record<string, unknown>, onlyEndpointId?: string, immediate = true) {
  const db = adminSupabase();
  let q = db.from('webhook_endpoints').select('id,url,secret,active').eq('user_id', userId).eq('active', true).contains('events', [event]);
  if (onlyEndpointId) q = q.eq('id', onlyEndpointId);
  const { data: endpoints } = await q;
  const results = [];
  for (const ep of endpoints || []) {
    const id = randomUUID();
    const payload = { id, type: event, created: Math.floor(Date.now() / 1000), data };
    const queuedAt = new Date().toISOString();
    const { error } = await db.from('webhook_deliveries').insert({ id, endpoint_id: ep.id, user_id: userId, event, payload, next_attempt_at: queuedAt, claimed_at: immediate ? queuedAt : null });
    if (error) continue;
    if (!immediate) { results.push({ endpoint_id: ep.id, delivery_id: id, queued: true }); continue; }
    const result = await attemptDelivery({ id, endpoint_id: ep.id, user_id: userId, event, payload, attempts: 0 }, ep);
    await db.from('webhook_deliveries').update({ claimed_at: null }).eq('id', id);
    results.push({ endpoint_id: ep.id, delivery_id: id, ...result });
  }
  return results;
}

/** Retries deliveries whose next_attempt_at has passed. Called by the cron route. */
export async function processDueDeliveries(limit = 25) {
  const db = adminSupabase();
  const { data: due } = await db.from('webhook_deliveries').select('id,endpoint_id,user_id,event,payload,attempts')
    .eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).lt('attempts', MAX_ATTEMPTS).order('next_attempt_at').limit(limit);
  let succeeded = 0, retried = 0;
  for (const d of due || []) {
    const claimedAt = new Date();
    const { data: claim } = await db.from('webhook_deliveries').update({ claimed_at: claimedAt.toISOString() })
      .eq('id', d.id).eq('status', 'pending')
      .or(`claimed_at.is.null,claimed_at.lt.${staleDeliveryClaimCutoff(claimedAt.getTime())}`)
      .select('id').maybeSingle();
    if (!claim) continue;
    const { data: ep } = await db.from('webhook_endpoints').select('id,url,secret,active').eq('id', d.endpoint_id).maybeSingle();
    if (!ep || !ep.active) { await db.from('webhook_deliveries').update({ status: 'failed', last_error: 'Endpoint was removed or disabled.', next_attempt_at: null, claimed_at: null }).eq('id', d.id); continue; }
    const r = await attemptDelivery(d, ep);
    await db.from('webhook_deliveries').update({ claimed_at: null }).eq('id', d.id);
    r.ok ? succeeded++ : retried++;
  }
  return { processed: (due || []).length, succeeded, stillFailing: retried };
}
