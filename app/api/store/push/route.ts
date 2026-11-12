import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isSupportedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      hostname === 'fcm.googleapis.com'
      || hostname === 'updates.push.services.mozilla.com'
      || hostname === 'web.push.apple.com'
      || hostname.endsWith('.notify.windows.com')
    );
  } catch {
    return false;
  }
}

function configured() {
  return Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT);
}

export async function GET() {
  if (!configured()) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, publicKey: process.env.WEB_PUSH_PUBLIC_KEY });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to enable notifications.' }, { status: 401 });
  if (!configured()) return NextResponse.json({ error: 'Push notifications are not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
  if (!isSupportedPushEndpoint(endpoint) || endpoint.length > 2048
    || p256dh.length < 40 || p256dh.length > 200 || auth.length < 16 || auth.length > 100) {
    return NextResponse.json({ error: 'Push subscription is invalid.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: existing, error: existingError } = await db.from('marketplace_push_subscriptions')
    .select('user_id').eq('endpoint', endpoint).maybeSingle();
  if (existingError) return NextResponse.json({ error: 'Push subscription could not be checked.' }, { status: 503 });
  if (existing && existing.user_id !== user.id) return NextResponse.json({ error: 'This push subscription belongs to a different account.' }, { status: 409 });
  const { error } = await db.from('marketplace_push_subscriptions').upsert({
    user_id: user.id, endpoint, p256dh, auth, updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  return error
    ? NextResponse.json({ error: 'Push subscription could not be saved.' }, { status: 503 })
    : NextResponse.json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to update notifications.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== 'string' || body.endpoint.length > 2048) return NextResponse.json({ error: 'Push endpoint is invalid.' }, { status: 400 });
  const { error } = await adminSupabase().from('marketplace_push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', body.endpoint);
  return error ? NextResponse.json({ error: 'Push subscription could not be removed.' }, { status: 503 }) : NextResponse.json({ subscribed: false });
}
