import { lookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { MAX_ATTEMPTS, isPrivateIp, nextAttemptDelaySec, signatureHeader, staleDeliveryClaimCutoff, validateEndpointUrl, type WebhookEvent } from '@/lib/webhooks-core';

type Endpoint = { id: string; url: string; secret: string; active: boolean };
type Delivery = { id: string; endpoint_id: string; user_id: string; event: string; payload: unknown; attempts: number };

/** One real HTTP attempt. Records the outcome; schedules a retry or marks the delivery failed. Never throws. */
export async function attemptDelivery(d: Delivery, ep: Endpoint) {
  const db = adminSupabase();
  const attempts = d.attempts + 1;
  let status: number | null = null, error = '';
  try {
    const check = validateEndpointUrl(ep.url);
    if (!check.ok) throw new Error(check.reason);
    const addrs = await lookup(check.url.hostname, { all: true });
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Host resolves to a private address.');
    const body = JSON.stringify(d.payload);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(check.url, {
        method: 'POST', redirect: 'manual', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'user-agent': 'LEO-OS-Webhooks/1.0', 'leo-event': d.event, 'leo-delivery-id': d.id, 'leo-signature': signatureHeader(ep.secret, body) },
        body,
      });
      status = res.status;
    } finally { clearTimeout(timer); }
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
export async function emitWebhookEvent(userId: string, event: WebhookEvent, data: Record<string, unknown>, onlyEndpointId?: string) {
  const db = adminSupabase();
  let q = db.from('webhook_endpoints').select('id,url,secret,active').eq('user_id', userId).eq('active', true).contains('events', [event]);
  if (onlyEndpointId) q = q.eq('id', onlyEndpointId);
  const { data: endpoints } = await q;
  const results = [];
  for (const ep of endpoints || []) {
    const id = randomUUID();
    const payload = { id, type: event, created: Math.floor(Date.now() / 1000), data };
    const { error } = await db.from('webhook_deliveries').insert({ id, endpoint_id: ep.id, user_id: userId, event, payload });
    if (error) continue;
    results.push({ endpoint_id: ep.id, delivery_id: id, ...(await attemptDelivery({ id, endpoint_id: ep.id, user_id: userId, event, payload, attempts: 0 }, ep)) });
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
