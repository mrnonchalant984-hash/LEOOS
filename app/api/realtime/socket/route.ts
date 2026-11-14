import { NextRequest, NextResponse } from 'next/server';
import { experimental_upgradeWebSocket as upgradeWebSocket, type WebSocketData } from '@vercel/functions';
import WebSocket from 'ws';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { POST as executeRealtimeTool } from '@/app/api/realtime/tools/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LIVE_ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const MAX_CLIENT_MESSAGE_BYTES = 1_250_000;
const MAX_AUDIO_BASE64 = 160_000;
const MAX_VIDEO_BASE64 = 1_100_000;
const MAX_TEXT_LENGTH = 2_000;
const SESSION_SECONDS = 270;

function safeJson(data: WebSocketData): Record<string, any> | null {
  try {
    const raw = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : Buffer.concat(data as Buffer[]).toString('utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_CLIENT_MESSAGE_BYTES) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/**
 * Authenticated, server-to-server Gemini Live relay. The browser never receives a
 * Google credential and cannot submit setup/toolResponse messages. Only validated
 * realtime audio/video/text input is forwarded upstream. Tool calls are executed
 * through the existing authenticated Leo tool endpoint.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin || new URL(origin).origin !== new URL(req.url).origin) return NextResponse.json({ error: 'Invalid WebSocket origin.' }, { status: 403 });
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Sign in to use Leo Live Voice.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'leo-realtime-websocket', 20, 3600);
  if (limited) return limited;

  const liveToken = req.cookies.get('leo_live_token')?.value;
  if (!liveToken || liveToken.length > 2048) return NextResponse.json({ error: 'Your Live session ticket expired. Reconnect to Leo.' }, { status: 401 });

  return upgradeWebSocket((client) => {
    let upstream: WebSocket | null = null;
    let closed = false;
    let latestUserTranscript = '';
    let ready = false;
    let upstreamConnected = false;
    let clientStarted = false;
    let setupSent = false;
    let resumeHandle = '';
    let sessionTimer: ReturnType<typeof setTimeout> | null = null;
    let lastVideoAt = 0;
    let messageCount = 0;

    const sendClient = (payload: Record<string, unknown>) => {
      if (client.readyState === 1) client.send(JSON.stringify(payload));
    };
    const cleanup = (code = 1000, reason = 'Session ended') => {
      if (closed) return;
      closed = true;
      if (sessionTimer) clearTimeout(sessionTimer);
      try { upstream?.close(code, reason.slice(0, 120)); } catch { /* no-op */ }
      upstream = null;
      try { if (client.readyState === 1) client.close(code, reason.slice(0, 120)); } catch { /* no-op */ }
    };

    const sendSetup = () => {
      if (!upstreamConnected || !clientStarted || setupSent || !upstream || upstream.readyState !== WebSocket.OPEN) return;
      try {
        const model = process.env.LEO_GEMINI_LIVE_MODEL?.trim() || 'gemini-3.8-live';
        upstream.send(JSON.stringify({ setup: {
          model: `models/${model}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
        } }));
        setupSent = true;
      } catch {
        sendClient({ leo_error: 'Leo could not configure the upstream Live session.' });
        cleanup(1011, 'Upstream setup failed');
      }
    };

    client.on('message', (data: WebSocketData) => {
      const message = safeJson(data);
      if (!message) {
        sendClient({ leo_error: 'Invalid or oversized realtime message.' });
        return;
      }
      // The only accepted control frame starts this server-owned session. The
      // optional resumption handle comes from a previous authenticated Live turn.
      if (message.leo_control === 'start' && !clientStarted) {
        clientStarted = true;
        resumeHandle = typeof message.resume_handle === 'string' && message.resume_handle.length <= 4096 ? message.resume_handle : '';
        sendSetup();
        return;
      }
      // Only realtimeInput is accepted from the browser. Setup, toolResponse, and
      // arbitrary provider control messages are server-owned.
      const input = message.realtimeInput;
      if (!input || typeof input !== 'object' || Array.isArray(input) || !upstream || upstream.readyState !== WebSocket.OPEN || !ready) return;
      const keys = Object.keys(input);
      if (keys.length !== 1 || !['audio', 'video', 'text', 'audioStreamEnd', 'activityStart', 'activityEnd'].includes(keys[0])) return;

      if (input.audio && typeof input.audio === 'object') {
        const audio = input.audio as Record<string, unknown>;
        if (audio.mimeType !== 'audio/pcm;rate=16000' || typeof audio.data !== 'string' || audio.data.length > MAX_AUDIO_BASE64) return;
      } else if (input.video && typeof input.video === 'object') {
        const video = input.video as Record<string, unknown>;
        const now = Date.now();
        if (now - lastVideoAt < 850) return; // cap visual input at ~1 FPS
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(String(video.mimeType)) || typeof video.data !== 'string' || video.data.length > MAX_VIDEO_BASE64) return;
        lastVideoAt = now;
      } else if (typeof input.text === 'string') {
        if (input.text.length > MAX_TEXT_LENGTH) return;
      } else if (input.audioStreamEnd !== true && !input.activityStart && !input.activityEnd) return;

      messageCount += 1;
      if (messageCount > 24_000) {
        sendClient({ leo_control: 'reconnect', reason: 'session_message_limit' });
        cleanup(1012, 'Session message limit reached');
        return;
      }
      try { upstream.send(JSON.stringify({ realtimeInput: input })); }
      catch { sendClient({ leo_error: 'The upstream Live connection is unavailable.' }); }
    });

    client.on('close', () => cleanup());
    client.on('error', () => cleanup(1011, 'Client socket error'));

    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      sendClient({ leo_error: 'Gemini Live is not configured on the server.' });
      cleanup(1011, 'Provider unavailable');
      return;
    }

    const upstreamUrl = new URL(LIVE_ENDPOINT);
    // Use the short-lived, single-use credential minted by /api/realtime/session.
    upstreamUrl.searchParams.set('access_token', liveToken);
    upstream = new WebSocket(upstreamUrl, { handshakeTimeout: 15_000, maxPayload: MAX_CLIENT_MESSAGE_BYTES });

    upstream.on('open', () => {
      upstreamConnected = true;
      sendSetup();
    });

    upstream.on('message', async (raw) => {
      if (closed) return;
      let event: Record<string, any>;
      try { event = JSON.parse(raw.toString()); } catch { return; }

      if (event.setupComplete) {
        ready = true;
        sendClient({ leo_ready: true });
        sessionTimer = setTimeout(() => {
          sendClient({ leo_control: 'reconnect', reason: 'vercel_function_duration' });
          cleanup(1012, 'Reconnect to continue the live session');
        }, SESSION_SECONDS * 1000);
      }

      const inputText = event.serverContent?.inputTranscription?.text;
      if (typeof inputText === 'string' && inputText.trim()) latestUserTranscript = `${latestUserTranscript} ${inputText}`.trim().slice(-12_000);

      const calls = event.toolCall?.functionCalls;
      if (Array.isArray(calls) && calls.length) {
        const responses: Array<{ id?: string; name: string; response: { result: string } }> = [];
        for (const call of calls.slice(0, 8)) {
          const name = typeof call?.name === 'string' ? call.name : 'unknown';
          const activityId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          sendClient({ leo_activity: { id: activityId, name, status: 'working' } });
          let result = 'The tool request could not be completed.';
          let failed = false;
          try {
            const toolRequest = new NextRequest(new URL('/api/realtime/tools', req.url), {
              method: 'POST',
              headers: new Headers({
                'content-type': 'application/json',
                authorization: `Bearer ${req.cookies.get('leo_realtime_access')?.value || ''}`,
                cookie: req.headers.get('cookie') || '',
              }),
              body: JSON.stringify({ name, args: call.args || {}, user_message: latestUserTranscript }),
            });
            const response = await executeRealtimeTool(toolRequest);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              result = typeof payload.error === 'string' ? payload.error : 'The tool request was not authorized.';
              failed = true;
            } else {
              result = typeof payload.result === 'string' ? payload.result.slice(0, 60_000) : 'The tool completed without additional details.';
              failed = Boolean(payload.isError);
            }
          } catch {
            result = 'The authenticated Leo tool bridge was unavailable.';
            failed = true;
          }
          sendClient({ leo_activity: { id: activityId, name, status: failed ? 'error' : 'done', detail: result.slice(0, 420) } });
          responses.push({ ...(typeof call.id === 'string' ? { id: call.id } : {}), name, response: { result } });
        }
        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
        }
        return;
      }

      // Forward provider messages (audio chunks, transcriptions, interruption and
      // turn lifecycle) without exposing credentials or raw upstream control.
      sendClient({ leo_event: event });
      if (event.serverContent?.turnComplete) latestUserTranscript = '';
    });

    upstream.on('error', () => {
      sendClient({ leo_error: 'The secure Gemini Live connection failed. Reconnect and try again.' });
      cleanup(1011, 'Upstream connection error');
    });
    upstream.on('close', () => {
      if (!closed) {
        sendClient({ leo_control: 'upstream_closed' });
        cleanup(1011, 'Upstream connection closed');
      }
    });
  });
}
