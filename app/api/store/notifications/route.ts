import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view notifications.' }, { status: 401 });
  const db = adminSupabase();
  const [{ data: notifications, error }, { data: preferences }] = await Promise.all([
    db.from('marketplace_notifications').select('id,kind,title,body,href,read_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
    db.from('marketplace_notification_preferences').select('messages,listing_updates,marketing,order_updates,support_updates').eq('user_id',user.id).maybeSingle(),
  ]);
  return error ? NextResponse.json({ error: 'Notifications are unavailable.' }, { status: 503 }) : NextResponse.json({ notifications: notifications ?? [], preferences: preferences ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to update preferences.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { preferences?: Record<string, unknown>; readId?: unknown } | null;
  const db = adminSupabase();
  if (typeof body?.readId === 'string' && /^[0-9a-f-]{36}$/i.test(body.readId)) {
    const { error } = await db.from('marketplace_notifications').update({ read_at: new Date().toISOString() }).eq('id',body.readId).eq('user_id',user.id);
    return error ? NextResponse.json({ error: 'Notification could not be marked read.' }, { status: 503 }) : NextResponse.json({ ok: true });
  }
  const p = body?.preferences; const keys = ['messages','listing_updates','marketing','order_updates','support_updates'];
  if (!p || keys.some(key => typeof p[key] !== 'boolean')) return NextResponse.json({ error: 'Provide each notification preference as true or false.' }, { status: 400 });
  const { error } = await db.from('marketplace_notification_preferences').upsert({ user_id:user.id, messages:p.messages, listing_updates:p.listing_updates, marketing:p.marketing, order_updates:p.order_updates, support_updates:p.support_updates, updated_at:new Date().toISOString() });
  return error ? NextResponse.json({ error: 'Preferences could not be saved.' }, { status: 503 }) : NextResponse.json({ ok: true });
}
