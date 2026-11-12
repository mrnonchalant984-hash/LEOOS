import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to submit a report.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-report-submit', 10, 3600); if (limited) return limited;
  const body = await request.json().catch(() => null) as { productId?: unknown; conversationId?: unknown; reason?: unknown; details?: unknown } | null;
  const productId = typeof body?.productId === 'string' && /^[0-9a-f-]{36}$/i.test(body.productId) ? body.productId : null;
  const conversationId = typeof body?.conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(body.conversationId) ? body.conversationId : null;
  if (Boolean(productId) === Boolean(conversationId) || typeof body?.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 80 || (body.details !== undefined && (typeof body.details !== 'string' || body.details.length > 2000))) return NextResponse.json({ error: 'Provide exactly one product or conversation and a valid report reason.' }, { status: 400 });
  const db = adminSupabase();
  if (productId) { const { data } = await db.from('marketplace_products').select('id').eq('id', productId).maybeSingle(); if (!data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 }); }
  if (conversationId) { const { data } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id').eq('id', conversationId).maybeSingle(); if (!data || ![data.buyer_id, data.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }); }
  const { data, error } = await db.from('marketplace_reports').insert({ reporter_id: user.id, product_id: productId, conversation_id: conversationId, reason: body.reason.trim(), details: typeof body.details === 'string' ? body.details.trim() : '' }).select('id,status').single();
  return error ? NextResponse.json({ error: 'Report could not be submitted.' }, { status: 503 }) : NextResponse.json({ report: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
