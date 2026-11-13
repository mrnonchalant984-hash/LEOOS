import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminSupabase, getProfile } from '@/lib/auth';
import { POST as queueAgentRun } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function send(controller: ReadableStreamDefaultController<Uint8Array>, data: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
}

/**
 * SSE lifecycle wrapper around the existing durable agent queue. It does not
 * duplicate the execution engine: authorization, plan checks, approval policy,
 * and job creation remain owned by /api/agents/run.
 */
export async function POST(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in required for streamed agent execution.' }, { status: 401 });
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid agent request.' }, { status: 400 });

  const queuedHeaders = new Headers(request.headers);
  queuedHeaders.delete('content-length');
  queuedHeaders.delete('transfer-encoding');
  const queuedRequest = new NextRequest(new URL('/api/agents/run', request.url), {
    method: 'POST',
    headers: queuedHeaders,
    body: JSON.stringify({ ...(body as Record<string, unknown>), async: true }),
    signal: request.signal,
  });
  const queuedResponse = await queueAgentRun(queuedRequest);
  const queuedPayload = await queuedResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!queuedResponse.ok) return NextResponse.json(queuedPayload, { status: queuedResponse.status });
  if (queuedPayload.status === 'waiting_approval') {
    return NextResponse.json(queuedPayload, { status: 202 });
  }
  const runId = typeof queuedPayload.run_id === 'string' ? queuedPayload.run_id : '';
  if (!runId) return NextResponse.json({ error: 'Agent queue did not return a run ID.' }, { status: 503 });

  const streamId = randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const db = adminSupabase();
      const seenEventIds = new Set<string>();
      const startedAt = Date.now();
      send(controller, { type: 'start', stream_id: streamId, run_id: runId, status: 'queued', agent: queuedPayload.agent ?? null });
      try {
        while (!request.signal.aborted && Date.now() - startedAt < 8 * 60_000) {
          const [{ data: run, error: runError }, { data: events, error: eventsError }] = await Promise.all([
            db.from('agent_runs').select('id,status,result,error,started_at,completed_at,metadata').eq('id', runId).eq('user_id', ctx.user.id).maybeSingle(),
            db.from('agent_execution_events').select('id,event_type,payload,created_at').eq('run_id', runId).eq('user_id', ctx.user.id).order('created_at', { ascending: true }).limit(100),
          ]);
          if (runError || eventsError || !run) {
            send(controller, { type: 'error', run_id: runId, error: 'Agent execution status could not be read.' });
            break;
          }
          for (const event of events ?? []) {
            if (seenEventIds.has(event.id)) continue;
            seenEventIds.add(event.id);
            send(controller, { type: 'event', run_id: runId, event: { type: event.event_type, payload: event.payload, created_at: event.created_at } });
          }
          send(controller, { type: 'status', run_id: runId, status: run.status, started_at: run.started_at });
          if (['completed', 'failed', 'cancelled', 'waiting_approval', 'waiting_owner_input'].includes(run.status)) {
            send(controller, { type: 'done', run_id: runId, status: run.status, result: run.result ?? null, error: run.error ?? null, completed_at: run.completed_at ?? null, metadata: run.metadata ?? null });
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 900));
        }
        if (request.signal.aborted) send(controller, { type: 'cancelled', run_id: runId });
        else if (Date.now() - startedAt >= 8 * 60_000) send(controller, { type: 'timeout', run_id: runId, message: 'The live stream timed out. The durable run continues; check Agent runs for its final status.' });
      } catch {
        if (!request.signal.aborted) send(controller, { type: 'error', run_id: runId, error: 'The agent event stream was interrupted. The durable run may still be active.' });
      } finally {
        try { controller.close(); } catch { /* Client disconnected. */ }
      }
    },
    cancel() { /* Durable job intentionally continues after a viewer disconnects. */ },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
