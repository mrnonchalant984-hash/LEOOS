import assert from 'node:assert/strict';

const base = process.env.BRAM_E2E_BASE_URL;
const cookie = process.env.BRAM_E2E_SESSION_COOKIE;
const expectedHost = process.env.BRAM_E2E_EXPECTED_HOST;
if (!base || !cookie || !expectedHost || process.env.BRAM_E2E_ALLOW_NON_PRODUCTION !== '1') {
  console.error('Set BRAM_E2E_BASE_URL, BRAM_E2E_EXPECTED_HOST, BRAM_E2E_SESSION_COOKIE and BRAM_E2E_ALLOW_NON_PRODUCTION=1.');
  process.exit(2);
}
const origin = new URL(base);
if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') throw new Error('Acceptance tests require HTTPS except on localhost.');
if (origin.hostname !== expectedHost) throw new Error('BASE_URL host does not match BRAM_E2E_EXPECTED_HOST.');
if (['leoos-omega.vercel.app', 'braverton.com', 'www.braverton.com'].includes(origin.hostname)) {
  throw new Error('Refusing to run destructive acceptance tests against a production hostname.');
}
if (!origin.hostname.includes('vercel.app') && origin.hostname !== 'localhost') {
  throw new Error('Use an isolated Vercel preview or localhost staging host for this acceptance suite.');
}

const headers = { Cookie: cookie, Accept: 'application/json' };
const created = { reminderId: null, eventId: null };
const now = Date.now();
const iso = value => new Date(value).toISOString();
async function request(path, init = {}) {
  const response = await fetch(new URL(path, origin), {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} returned HTTP ${response.status}: ${body.error || 'no error detail'}`);
  return body;
}

try {
  const reminder = await request('/api/bram/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Braverton staging acceptance reminder',
      body: 'Temporary acceptance-test record; safe to cancel.',
      scheduled_for: iso(now + 15 * 60_000),
      timezone: 'Africa/Lagos',
      recurrence: { frequency: 'once' },
    }),
  });
  assert.equal(reminder.persisted, true);
  created.reminderId = reminder.reminder.id;
  const reminders = await request('/api/bram/reminders');
  assert.ok(reminders.reminders.some(item => item.id === created.reminderId));
  const cancelled = await request('/api/bram/reminders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: created.reminderId, status: 'cancelled' }),
  });
  assert.equal(cancelled.reminder.status, 'cancelled');
  console.log('PASS authenticated reminder create/list/cancel');

  const start = now + 60 * 60_000;
  const event = await request('/api/bram/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Braverton staging acceptance event',
      description: 'Temporary acceptance-test event; safe to delete.',
      starts_at: iso(start),
      ends_at: iso(start + 30 * 60_000),
      timezone: 'Africa/Lagos',
      location: 'Staging',
    }),
  });
  assert.equal(event.persisted, true);
  created.eventId = event.event.id;
  const query = `/api/bram/calendar?from=${encodeURIComponent(iso(start - 60_000))}&to=${encodeURIComponent(iso(start + 60 * 60_000))}`;
  const events = await request(query);
  assert.ok(events.events.some(item => item.id === created.eventId));
  const updated = await request('/api/bram/calendar', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: created.eventId,
      title: 'Braverton staging acceptance event updated',
      description: 'Temporary acceptance-test event; safe to delete.',
      starts_at: iso(start),
      ends_at: iso(start + 45 * 60_000),
      timezone: 'Africa/Lagos',
      location: 'Staging',
    }),
  });
  assert.equal(updated.persisted, true);
  const deleted = await request(`/api/bram/calendar?id=${encodeURIComponent(created.eventId)}`, { method: 'DELETE' });
  assert.equal(deleted.deleted, true);
  created.eventId = null;
  console.log('PASS authenticated calendar create/list/update/delete');

  const form = new FormData();
  form.append('file', new Blob(['export const bramAcceptance = true;\n'], { type: 'text/plain' }), 'bram-acceptance.ts');
  const review = await request('/api/file-review', { method: 'POST', body: form });
  assert.equal(typeof review.reply, 'string');
  assert.ok(review.reply.trim().length > 0);
  console.log('PASS authenticated source-review execution');
} finally {
  if (created.eventId) {
    await request(`/api/bram/calendar?id=${encodeURIComponent(created.eventId)}`, { method: 'DELETE' }).catch(() => {});
  }
  if (created.reminderId) {
    await request('/api/bram/reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: created.reminderId, status: 'cancelled' }),
    }).catch(() => {});
  }
}
