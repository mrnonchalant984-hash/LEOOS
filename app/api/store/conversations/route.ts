import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view conversations.' }, { status: 401 });
  const db = adminSupabase();
  const { data, error } = await db.from('marketplace_conversations').select('id,product_id,buyer_id,seller_id,created_at,product:marketplace_products(title,slug,image_urls)').or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Conversations are unavailable.' }, { status: 503 });
  const ids = (data ?? []).map((row) => row.id);
  const counts = ids.length ? await db.from('marketplace_messages').select('conversation_id').in('conversation_id', ids).is('read_at', null).neq('sender_id', user.id) : { data: [], error: null };
  const unread = new Map<string, number>(); for (const message of counts.data ?? []) unread.set(message.conversation_id, (unread.get(message.conversation_id) ?? 0) + 1);
  return NextResponse.json({ conversations: (data ?? []).map((row) => ({ ...row, unreadCount: unread.get(row.id) ?? 0 })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to contact a seller.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-conversation-start', 20, 3600); if (limited) return limited;
  const body = await request.json().catch(() => null) as { productId?: unknown; message?: unknown } | null;
  if (typeof body?.productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.productId) || typeof body.message !== 'string' || body.message.trim().length < 1 || body.message.length > 4000) return NextResponse.json({ error: 'Enter a message of up to 4,000 characters.' }, { status: 400 });
  const db = adminSupabase(); const { data: product } = await db.from('marketplace_products').select('id,seller_id').eq('id', body.productId).eq('status', 'active').maybeSingle();
  if (!product) return NextResponse.json({ error: 'Product is not available.' }, { status: 404 });
  if (product.seller_id === user.id) return NextResponse.json({ error: 'You cannot contact yourself.' }, { status: 400 });
  const { data: conversation, error } = await db.from('marketplace_conversations').upsert({ product_id: product.id, buyer_id: user.id, seller_id: product.seller_id }, { onConflict: 'product_id,buyer_id', ignoreDuplicates: true }).select('id').maybeSingle();
  let conversationId = conversation?.id;
  if (!conversationId) { const existing = await db.from('marketplace_conversations').select('id,blocked_by').eq('product_id', product.id).eq('buyer_id', user.id).single(); conversationId = existing.data?.id; if (existing.data?.blocked_by) return NextResponse.json({ error: 'Messaging is unavailable for this conversation.' }, { status: 403 }); }
  if (error && !conversationId) return NextResponse.json({ error: 'Conversation could not be started.' }, { status: 503 });
  if (!conversationId) return NextResponse.json({ error: 'Conversation could not be started.' }, { status: 503 });
  const sent = await db.from('marketplace_messages').insert({ conversation_id: conversationId, sender_id: user.id, body: body.message.trim() }).select('id').single();
  if (sent.error) return NextResponse.json({ error: 'Message could not be sent.' }, { status: 503 });
  await notifyMarketplaceUser({ userId: product.seller_id, kind: 'message', title: 'New marketplace message', body: body.message.trim().slice(0,500), href: '/store/messages', preference: 'messages' }).catch(() => undefined);
  return NextResponse.json({ conversationId, messageId: sent.data.id }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
