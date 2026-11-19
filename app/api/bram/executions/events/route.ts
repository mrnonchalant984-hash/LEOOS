import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const sessionId = req.nextUrl.searchParams.get('session_id') || '';
  const after = Math.max(0, Number(req.nextUrl.searchParams.get('after')) || 0);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: 'A valid chat session is required.' }, { status: 400 });
  }
  const db = adminSupabase();
  const { data: chat, error: chatError } = await db.from('chats_v2').select('id')
    .eq('id', sessionId).eq('user_id', auth.user.id).maybeSingle();
  if (chatError) return NextResponse.json({ error: 'Chat ownership could not be verified.' }, { status: 503 });
  if (!chat) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
  const { data, error } = await db.from('bram_execution_events')
    .select('id,request_id,execution_id,worker_id,phase,event_type,status,message,metadata,created_at')
    .eq('user_id', auth.user.id).eq('session_id', sessionId).gt('id', after)
    .order('id', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: 'Execution events are unavailable.' }, { status: 503 });
  return NextResponse.json({ events: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  });
}
