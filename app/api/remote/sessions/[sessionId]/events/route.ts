import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const allowedTypes = new Set(['message', 'chat.open', 'chat.sync', 'ping']);
async function authorizedPairing(req: NextRequest, sessionId: string) {
  const ctx = await getProfile(req);
  if (!ctx) return { response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  const db = adminSupabase();
  const { data, error } = await db.from('leo_remote_pairings').select('id,user_id,status,expires_at').eq('id', sessionId).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return { response: NextResponse.json({ error: 'Remote service unavailable.' }, { status: 503 }) };
  if (!data || data.status !== 'paired') return { response: NextResponse.json({ error: 'Device session is not paired or has been revoked.' }, { status: 403 }) };
  return { ctx, db, pairing: data };
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const auth = await authorizedPairing(req, sessionId);
  if ('response' in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  const eventType = String(body.type || 'message');
  if (!allowedTypes.has(eventType)) return NextResponse.json({ error: 'Unsupported remote event type.' }, { status: 400 });
  const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
  const encoded = JSON.stringify(payload);
  if (encoded.length > 12_000) return NextResponse.json({ error: 'Remote event payload is too large (12 KB maximum).' }, { status: 413 });
  if (eventType === 'message' && (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 4000)) return NextResponse.json({ error: 'Message text must contain 1–4000 characters.' }, { status: 400 });
  if (eventType === 'chat.open' && (typeof payload.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sessionId) || (payload.title !== undefined && (typeof payload.title !== 'string' || payload.title.length > 100)))) return NextResponse.json({ error: 'Chat handoff requires a valid chat session ID and a short title.' }, { status: 400 });
  const deviceId = String(body.deviceId || 'web-device').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'web-device';
  const { data, error } = await auth.db.from('leo_remote_events').insert({ pairing_id: sessionId, user_id: auth.ctx.user.id, device_id: deviceId, event_type: eventType, payload }).select('id,event_type,payload,device_id,created_at').single();
  if (error || !data) return NextResponse.json({ error: 'Unable to send remote event.' }, { status: 503 });
  await auth.db.from('leo_remote_pairings').update({ last_seen_at: new Date().toISOString() }).eq('id', sessionId);
  return NextResponse.json({ event: data }, { status: 201 });
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const auth = await authorizedPairing(req, sessionId);
  if ('response' in auth) return auth.response;
  const initialCursor = Math.max(0, Number(req.nextUrl.searchParams.get('after') || 0) || 0);
  const queryEvents = async (cursor: number) => auth.db.from('leo_remote_events').select('id,event_type,payload,device_id,created_at').eq('pairing_id', sessionId).eq('user_id', auth.ctx.user.id).gt('id', cursor).order('id', { ascending: true }).limit(100);
  if (req.nextUrl.searchParams.get('stream') === '1') {
    const encoder = new TextEncoder();
    let stopStream = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let cursor = initialCursor;
        let closed = false;
        const emit = (value: unknown) => { if (!closed && !stopStream) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); };
        const close = () => { if (!closed) { closed = true; try { controller.close(); } catch {} } };
        const run = async () => {
          const deadline = Date.now() + 7_500;
          try {
            while (!closed && !stopStream && Date.now() < deadline) {
              const { data: currentPairing } = await auth.db.from('leo_remote_pairings').select('status').eq('id', sessionId).eq('user_id', auth.ctx.user.id).maybeSingle();
              if (currentPairing?.status !== 'paired') break;
              const { data, error } = await queryEvents(cursor);
              if (error) { emit({ error: 'Remote stream temporarily unavailable.' }); break; }
              for (const item of data || []) { emit({ event: item }); cursor = Math.max(cursor, Number(item.id)); }
              if (!data?.length) emit({ heartbeat: true, cursor });
              await new Promise((resolve) => setTimeout(resolve, 700));
            }
          } catch { emit({ error: 'Remote stream interrupted.' }); }
          finally { close(); }
        };
        void run();
      },
      cancel() { stopStream = true; },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
  }
  const { data, error } = await queryEvents(initialCursor);
  if (error) return NextResponse.json({ error: 'Unable to read remote events.' }, { status: 503 });
  return NextResponse.json({ events: data || [], cursor: data?.length ? data[data.length - 1].id : initialCursor }, { headers: { 'Cache-Control': 'no-store' } });
}
