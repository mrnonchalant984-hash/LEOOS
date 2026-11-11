import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view messages.' }, { status: 401 });
  const { id } = await context.params; const db = adminSupabase();
  const { data: conversation } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id').eq('id', id).maybeSingle();
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const { data, error } = await db.from('marketplace_messages').select('id,sender_id,body,attachment_path,created_at,read_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: 'Messages are unavailable.' }, { status: 503 });
  await db.from('marketplace_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', id).neq('sender_id', user.id).is('read_at', null);
  return NextResponse.json({ messages: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to send messages.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-message-send', 60, 3600); if (limited) return limited;
  const { id } = await context.params; const body = await request.json().catch(() => null) as { body?: unknown } | null;
  if (typeof body?.body !== 'string' || body.body.trim().length < 1 || body.body.length > 4000) return NextResponse.json({ error: 'Enter a message of up to 4,000 characters.' }, { status: 400 });
  const db = adminSupabase(); const { data: conversation } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id,blocked_by').eq('id', id).maybeSingle();
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  if (conversation.blocked_by) return NextResponse.json({ error: 'Messaging is unavailable for this conversation.' }, { status: 403 });
  const { data, error } = await db.from('marketplace_messages').insert({ conversation_id: id, sender_id: user.id, body: body.body.trim() }).select('id,sender_id,body,created_at').single();
  return error ? NextResponse.json({ error: 'Message could not be sent.' }, { status: 503 }) : NextResponse.json({ message: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
