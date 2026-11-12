import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage privacy requests.' }, { status: 401 });
  const db = adminSupabase();
  const [{ data: requests }, { data: consents }, { data: preferences }] = await Promise.all([
    db.from('marketplace_data_requests').select('id,request_type,status,note,created_at,updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    db.from('marketplace_consents').select('consent_key,version,granted,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_notification_preferences').select('messages,listing_updates,marketing,order_updates,support_updates').eq('user_id', user.id).maybeSingle(),
  ]);
  return NextResponse.json({ requests: requests ?? [], consents: consents ?? [], notificationPreferences: preferences ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to submit a privacy request.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { type?: unknown; note?: unknown } | null;
  if (!['export', 'deletion'].includes(String(body?.type)) || (body?.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000))) return NextResponse.json({ error: 'Choose export or deletion and provide an optional short note.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_data_requests').insert({ user_id: user.id, request_type: body?.type, note: typeof body?.note === 'string' ? body.note.trim() : null }).select('id,request_type,status,created_at').single();
  return error ? NextResponse.json({ error: 'A request of this type is already open, or the request could not be created.' }, { status: 409 }) : NextResponse.json({ request: data }, { status: 201 });
}
