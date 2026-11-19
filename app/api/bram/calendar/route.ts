import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date()); return true; } catch { return false; }
}
function eventInput(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const startsAt = typeof body.starts_at === 'string' ? new Date(body.starts_at) : null;
  const endsAt = typeof body.ends_at === 'string' ? new Date(body.ends_at) : null;
  const timezone = body.timezone;
  if (!title || title.length > 180 || description.length > 4000 || location.length > 500 ||
      !startsAt || !endsAt || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt || !validTimezone(timezone)) return null;
  return { title, description, location, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), timezone };
}
export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const now = new Date();
  const start = from && Number.isFinite(Date.parse(from)) ? new Date(from) : new Date(now.getTime() - 7 * 86400000);
  const end = to && Number.isFinite(Date.parse(to)) ? new Date(to) : new Date(now.getTime() + 90 * 86400000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400000) return NextResponse.json({ error: 'Calendar range must be positive and no longer than one year.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('bram_calendar_events')
    .select('id,title,description,starts_at,ends_at,timezone,location,status,source,created_at,updated_at')
    .eq('user_id', ctx.user.id).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString())
    .order('starts_at', { ascending: true }).limit(500);
  if (error) return NextResponse.json({ error: 'Calendar events are temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const event = body && typeof body === 'object' ? eventInput(body) : null;
  if (!event) return NextResponse.json({ error: 'Provide a title, valid start/end timestamps, and IANA timezone.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('bram_calendar_events').insert({
    ...event, user_id: ctx.user.id, source: 'bram', status: 'confirmed',
  }).select('id,title,description,starts_at,ends_at,timezone,location,status,source').single();
  if (error || !data) return NextResponse.json({ error: 'Calendar event could not be saved.' }, { status: 503 });
  return NextResponse.json({ event: data, persisted: true }, { status: 201 });
}
export async function PATCH(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid event ID is required.' }, { status: 400 });
  const event = eventInput(body);
  if (!event) return NextResponse.json({ error: 'Provide a complete valid event update.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('bram_calendar_events').update({ ...event, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', ctx.user.id).select('id,title,starts_at,ends_at,timezone,location,status').maybeSingle();
  if (error) return NextResponse.json({ error: 'Calendar event could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Calendar event not found.' }, { status: 404 });
  return NextResponse.json({ event: data, persisted: true });
}
export async function DELETE(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid event ID is required.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('bram_calendar_events').delete().eq('id', id).eq('user_id', ctx.user.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Calendar event could not be deleted.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Calendar event not found.' }, { status: 404 });
  return NextResponse.json({ deleted: true, id });
}
