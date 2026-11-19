import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = ['accepted','working','tool_started','tool_completed','waiting_for_connection','completed','failed','cancelled'] as const;

async function ownsSession(sessionId: string, userId: string) {
  const { data, error } = await adminSupabase().from('chats_v2').select('id')
    .eq('id', sessionId).eq('user_id', userId).maybeSingle();
  return !error && Boolean(data);
}

export async function GET(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const executionId = request.nextUrl.searchParams.get('execution_id') || '';
  const sessionId = request.nextUrl.searchParams.get('session_id') || '';
  const after = Number(request.nextUrl.searchParams.get('after') || 0);
  if (!UUID.test(executionId) || !UUID.test(sessionId) || !Number.isSafeInteger(after) || after < 0)
    return NextResponse.json({ error: 'A valid execution, session and cursor are required.' }, { status: 400 });
  if (!(await ownsSession(sessionId, auth.user.id)))
    return NextResponse.json({ error: 'Chat session not found.' }, { status: 404 });
  const { data, error } = await adminSupabase().from('bram_execution_events')
    .select('id,execution_id,session_id,event_type,message,tool_name,payload,created_at')
    .eq('owner_user_id', auth.user.id).eq('execution_id', executionId)
    .eq('session_id', sessionId).gt('id', after).order('id', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: 'Execution events are unavailable. Apply the Bram collaboration migration.' }, { status: 503 });
  return NextResponse.json({ events: data || [], cursor: data?.at(-1)?.id ?? after }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const executionId = typeof body?.execution_id === 'string' ? body.execution_id : '';
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
  const eventType = typeof body?.event_type === 'string' ? body.event_type : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const toolName = typeof body?.tool_name === 'string' ? body.tool_name.slice(0, 120) : null;
  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
  if (!UUID.test(executionId) || !UUID.test(sessionId) || !EVENT_TYPES.includes(eventType as typeof EVENT_TYPES[number]) || !message || message.length > 1000)
    return NextResponse.json({ error: 'Execution event is invalid.' }, { status: 400 });
  if (!(await ownsSession(sessionId, auth.user.id)))
    return NextResponse.json({ error: 'Chat session not found.' }, { status: 404 });
  const { data, error } = await adminSupabase().from('bram_execution_events').insert({
    execution_id: executionId, session_id: sessionId, owner_user_id: auth.user.id,
    event_type: eventType, message, tool_name: toolName, payload,
  }).select('id,execution_id,session_id,event_type,message,tool_name,payload,created_at').single();
  if (error) return NextResponse.json({ error: 'Execution event could not be persisted.' }, { status: 503 });
  return NextResponse.json({ event: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
