import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to manage listings.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-listing-manage', 30, 3600);
  if (limited) return limited;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Listing was not found.' }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const transitions: Record<string, string> = { pause: 'paused', resume: 'pending_review', sold: 'sold' };
  const status = typeof body?.action === 'string' ? transitions[body.action] : undefined;
  if (!status) return NextResponse.json({ error: 'Choose pause, resume, or sold.' }, { status: 400 });
  const allowedStatuses = body?.action === 'pause' ? ['active'] : body?.action === 'resume' ? ['paused'] : ['active', 'paused'];
  const db = adminSupabase();
  const { data, error } = await db.from('marketplace_products').update({ status, published_at: null }).eq('id', id).eq('seller_id', user.id).in('status', allowedStatuses).select('id,slug,status').maybeSingle();
  if (error) return NextResponse.json({ error: 'Listing could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Listing was not found or cannot make that change.' }, { status: 404 });
  return NextResponse.json({ product: data }, { headers: { 'Cache-Control': 'no-store' } });
}

