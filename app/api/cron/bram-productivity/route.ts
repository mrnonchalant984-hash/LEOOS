import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), hour: Number(value.hour), minute: Number(value.minute), second: Number(value.second) };
}
function zonedLocalToUtc(parts: LocalParts, timezone: string): Date {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = new Date(wallClock);
  for (let i = 0; i < 3; i += 1) {
    const actual = localParts(candidate, timezone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + wallClock - represented);
  }
  return candidate;
}
function nextOccurrence(from: Date, frequency: string, timezone: string): Date | null {
  if (frequency === 'once') return null;
  const p = localParts(from, timezone);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  else if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === 'monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else return null;
  return zonedLocalToUtc({ ...p, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, timezone);
}
function authorized(req: NextRequest) {
  const secret = process.env.BRAM_SCHEDULER_SECRET || process.env.CRON_SECRET;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(secret && secret.length >= 32 && token && token === secret);
}
async function sendEmail(to: string, title: string, body: string, scheduledFor: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return { configured: false as const };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject: `Reminder: ${title}`,
      html: `<p>${escapeHtml(body || title)}</p><p>Scheduled for ${escapeHtml(scheduledFor)}.</p>`,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok || !payload.id) return { configured: true as const, ok: false as const, code: `resend_http_${response.status}` };
  return { configured: true as const, ok: true as const, id: payload.id };
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char); }

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized scheduler.' }, { status: 401 });
  const db = adminSupabase();
  const worker = `bram-reminders-${randomUUID()}`;
  const { data: reminders, error } = await db.rpc('claim_due_bram_reminders', { p_worker: worker, p_limit: 25, p_lease_seconds: 90 });
  if (error) return NextResponse.json({ error: 'Reminder queue claim failed. Verify the Bram productivity migration and service-role grants.' }, { status: 503 });
  const results: Array<{ id: string; status: string; email?: string }> = [];
  for (const reminder of reminders || []) {
    try {
      const scheduledFor = new Date(reminder.next_run_at).toISOString();
      const { error: inAppError } = await db.from('bram_reminder_deliveries').upsert({
        reminder_id: reminder.id, user_id: reminder.user_id, scheduled_for: scheduledFor,
        channel: 'in_app', status: 'sent', attempt_count: 1, delivered_at: new Date().toISOString(),
      }, { onConflict: 'reminder_id,scheduled_for,channel', ignoreDuplicates: true });
      if (inAppError) throw new Error('in_app_delivery_persist_failed');

      let emailStatus = 'not_configured';
      if (process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL) {
        const { data: profile, error: profileError } = await db.from('profiles').select('email').eq('id', reminder.user_id).maybeSingle();
        if (profileError) throw new Error('recipient_lookup_failed');
        if (profile?.email) {
          const { data: previous } = await db.from('bram_reminder_deliveries')
            .select('id,status,attempt_count').eq('reminder_id', reminder.id).eq('scheduled_for', scheduledFor).eq('channel', 'email').maybeSingle();
          if (previous?.status === 'sent') emailStatus = 'sent';
          else {
            const sent = await sendEmail(profile.email, reminder.title, reminder.body || '', scheduledFor);
            if (!sent.configured) emailStatus = 'not_configured';
            else if (!sent.ok) {
              emailStatus = 'retry_pending';
              await db.from('bram_reminder_deliveries').upsert({
                reminder_id: reminder.id, user_id: reminder.user_id, scheduled_for: scheduledFor,
                channel: 'email', status: 'failed', attempt_count: Number(previous?.attempt_count || 0) + 1,
                error_code: sent.code,
              }, { onConflict: 'reminder_id,scheduled_for,channel' });
              throw new Error(sent.code);
            } else {
              emailStatus = 'sent';
              await db.from('bram_reminder_deliveries').upsert({
                reminder_id: reminder.id, user_id: reminder.user_id, scheduled_for: scheduledFor,
                channel: 'email', status: 'sent', attempt_count: Number(previous?.attempt_count || 0) + 1,
                provider_message_id: sent.id, delivered_at: new Date().toISOString(), error_code: null,
              }, { onConflict: 'reminder_id,scheduled_for,channel' });
            }
          }
        }
      }

      const recurrence = reminder.recurrence && typeof reminder.recurrence === 'object' ? reminder.recurrence.frequency : 'once';
      const next = nextOccurrence(new Date(scheduledFor), String(recurrence), reminder.timezone);
      const update = next
        ? { status: 'scheduled', next_run_at: next.toISOString(), lease_owner: null, lease_expires_at: null, last_delivery_error: null, delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : { status: 'delivered', lease_owner: null, lease_expires_at: null, last_delivery_error: null, delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { error: updateError } = await db.from('bram_reminders').update(update).eq('id', reminder.id).eq('lease_owner', worker);
      if (updateError) throw new Error('reminder_finalize_failed');
      results.push({ id: reminder.id, status: next ? 'rescheduled' : 'delivered', email: emailStatus });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'delivery_failed';
      await db.from('bram_reminders').update({
        status: 'scheduled', next_run_at: new Date(Date.now() + Math.min(3600, 5 * (2 ** Math.min(6, Number(reminder.delivery_attempts || 1)))) * 60_000).toISOString(),
        lease_owner: null, lease_expires_at: null, last_delivery_error: message.slice(0, 120), updated_at: new Date().toISOString(),
      }).eq('id', reminder.id).eq('lease_owner', worker);
      results.push({ id: reminder.id, status: 'retry_scheduled' });
    }
  }
  return NextResponse.json({ claimed: reminders?.length || 0, processed: results.length, results, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(req: NextRequest) { return POST(req); }
