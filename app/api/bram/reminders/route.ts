import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
const TZ_PATTERN = /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)*$/;

function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80 || !TZ_PATTERN.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date()); return true; } catch { return false; }
}

function parseRecurrence(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { frequency: 'once' as const };
  const frequency = (value as Record<string, unknown>).frequency;
  if (!['once', 'daily', 'weekly', 'monthly'].includes(String(frequency))) return null;
  return { frequency: frequency as 'once' | 'daily' | 'weekly' | 'monthly' };
}

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const db = adminSupabase();
  const [reminders, deliveries] = await Promise.all([
    db.from('bram_reminders').select('id,title,body,scheduled_for,timezone,recurrence,status,next_run_at,delivered_at,created_at').eq('user_id', ctx.user.id).neq('status', 'cancelled').order('next_run_at', { ascending: true }).limit(100),
    db.from('bram_reminder_deliveries').select('id,reminder_id,scheduled_for,channel,status,attempt_count,delivered_at,created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (reminders.error || deliveries.error) return NextResponse.json({ error: 'Reminder data is temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ reminders: reminders.data || [], deliveries: deliveries.data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.body === 'string' ? body.body.trim() : '';
  const scheduledFor = typeof body?.scheduled_for === 'string' ? new Date(body.scheduled_for) : null;
  const timezone = body?.timezone;
  const recurrence = parseRecurrence(body?.recurrence);
  if (!title || title.length > 180 || description.length > 4000 || !scheduledFor || !Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now() || !validTimezone(timezone) || !recurrence) {
    return NextResponse.json({ error: 'Provide a title, future scheduled_for timestamp, valid IANA timezone, and supported recurrence (once, daily, weekly, monthly).' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data, error } = await db.from('bram_reminders').insert({
    user_id: ctx.user.id, title, body: description, scheduled_for: scheduledFor.toISOString(),
    timezone, recurrence, next_run_at: scheduledFor.toISOString(), status: 'scheduled',
  }).select('id,title,body,scheduled_for,timezone,recurrence,status,next_run_at,created_at').single();
  if (error || !data) return NextResponse.json({ error: 'Reminder could not be saved.' }, { status: 503 });
  return NextResponse.json({ reminder: data, persisted: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid reminder ID is required.' }, { status: 400 });
  const update: Record<string, unknown> = {};
  if (body?.status === 'cancelled') update.status = 'cancelled';
  if (typeof body?.title === 'string' && body.title.trim().length > 0 && body.title.trim().length <= 180) update.title = body.title.trim();
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No supported reminder changes were supplied.' }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const { data, error } = await adminSupabase().from('bram_reminders').update(update).eq('id', id).eq('user_id', ctx.user.id).in('status', ['scheduled','failed']).select('id,status,title').maybeSingle();
  if (error) return NextResponse.json({ error: 'Reminder could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Reminder was not found or is already being delivered.' }, { status: 404 });
  return NextResponse.json({ reminder: data, persisted: true });
}
