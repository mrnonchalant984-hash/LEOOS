import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view messages.' }, { status: 401 });
  const { id } = await context.params; const db = adminSupabase();
  const { data: conversation } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id,blocked_by').eq('id', id).maybeSingle();
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const { data, error } = await db.from('marketplace_messages').select('id,sender_id,body,attachment_path,created_at,read_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: 'Messages are unavailable.' }, { status: 503 });
  await db.from('marketplace_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', id).neq('sender_id', user.id).is('read_at', null);
  const messages = await Promise.all((data ?? []).map(async message => {
    if (!message.attachment_path) return { ...message, attachment_path: undefined, attachmentUrl: null };
    const prefix = `${id}/`;
    if (!message.attachment_path.startsWith(prefix)) return { ...message, attachment_path: undefined, attachmentUrl: null };
    const { data: signed } = await db.storage.from('marketplace-private').createSignedUrl(message.attachment_path, 120);
    return { ...message, attachment_path: undefined, attachmentUrl: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ messages, blocked: Boolean(conversation.blocked_by), blockedByYou: conversation.blocked_by === user.id }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to send messages.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-message-send', 60, 3600); if (limited) return limited;
  const { id } = await context.params; const body = await request.json().catch(() => null) as { body?: unknown; attachmentPath?: unknown } | null;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  const attachmentPath = typeof body?.attachmentPath === 'string' ? body.attachmentPath : null;
  if ((!text && !attachmentPath) || text.length > 4000) return NextResponse.json({ error: 'Enter a message or attach a file.' }, { status: 400 });
  const db = adminSupabase(); const { data: conversation } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id,blocked_by').eq('id', id).maybeSingle();
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  if (conversation.blocked_by) return NextResponse.json({ error: 'Messaging is unavailable for this conversation.' }, { status: 403 });
  if (attachmentPath && !new RegExp(`^${id}/[0-9a-f-]{36}\\.(webp|pdf)$`, 'i').test(attachmentPath)) return NextResponse.json({ error: 'Attachment does not belong to this conversation.' }, { status: 400 });
  const { data, error } = await db.from('marketplace_messages').insert({ conversation_id: id, sender_id: user.id, body: text || 'Attachment', attachment_path: attachmentPath }).select('id,sender_id,body,created_at').single();
  if (!error && conversation) await notifyMarketplaceUser({ userId: conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id, kind: 'message', title: 'New marketplace message', body: text || 'You received an attachment.', href: '/store/messages', preference: 'messages' }).catch(() => undefined);
  return error ? NextResponse.json({ error: 'Message could not be sent.' }, { status: 503 }) : NextResponse.json({ message: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
