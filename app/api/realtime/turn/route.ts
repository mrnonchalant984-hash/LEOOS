import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Persists realtime voice turns into the same account-owned chat history as Main Chat. */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to save this Leo conversation.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-realtime-turn', 30, 60);
  if (limited) return limited;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = body?.session_id;
  const userMessage = body?.user_message;
  const assistantMessage = body?.assistant_message;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId) || typeof userMessage !== 'string' || !userMessage.trim() || userMessage.length > 12000 || typeof assistantMessage !== 'string' || !assistantMessage.trim() || assistantMessage.length > 12000) {
    return NextResponse.json({ error: 'A valid completed voice turn is required.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: chat, error } = await db.from('chats_v2').select('user_id,messages').eq('id', sessionId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Leo conversation history is temporarily unavailable.' }, { status: 503 });
  if (chat && chat.user_id !== auth.user.id) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
  const history = Array.isArray(chat?.messages) ? chat.messages.filter((item: any) => (item?.role === 'user' || item?.role === 'assistant') && typeof item?.content === 'string').slice(-78) : [];
  const updated = [...history, { role: 'user', content: userMessage.trim() }, { role: 'assistant', content: assistantMessage.trim() }].slice(-80);
  const write = chat
    ? await db.from('chats_v2').update({ messages: updated, updated_at: new Date().toISOString() }).eq('id', sessionId).eq('user_id', auth.user.id)
    : await db.from('chats_v2').insert({ id: sessionId, user_id: auth.user.id, title: userMessage.trim().slice(0, 60), messages: updated, updated_at: new Date().toISOString() });
  if (write.error) return NextResponse.json({ error: 'Leo could not save this voice turn.' }, { status: 503 });
  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
