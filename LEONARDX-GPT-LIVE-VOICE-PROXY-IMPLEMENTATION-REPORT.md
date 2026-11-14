# LeonardX — Server-Proxied GPT-Style Live Voice + Visual Input

## Current status correction

**The implementation described below is not wired into the current application.** The session endpoint now returns `gemini_turn_based` and does not issue the `leo_live_token` or `leo_realtime_access` cookies required by `/api/realtime/socket`. The widget consequently uses `/api/voice` and does not open this WebSocket. The socket handler depends on Vercel's `experimental_upgradeWebSocket`; there is no separate Cloudflare Worker or route for the supplied `workers.dev` host. Camera/screen capture and session resumption are not verified as active features. Do not treat the following design notes as deployable or completed.

## Intended implementation (not operational)

### Server-proxied realtime audio
- Added `GET /api/realtime/socket`, using Vercel's Next.js `upgradeWebSocket()` support.
- The browser now streams microphone PCM to LeonardX first; LeonardX opens the upstream Gemini Live WebSocket and relays audio both ways.
- Gemini's single-use ephemeral credential is stored in a short-lived, route-scoped `HttpOnly`, `Secure` (on HTTPS), `SameSite=Strict` cookie. The browser does not receive the provider credential or place it in a URL.
- The session endpoint also places the authenticated Supabase access token in a short-lived route-scoped `HttpOnly` cookie so the WebSocket handshake and tool bridge can re-authenticate without exposing a bearer token to browser JavaScript.
- The relay validates same-origin WebSocket handshakes, input message sizes, accepted message types, PCM MIME type, video MIME type, and visual frame frequency.
- Browser-originated setup messages and tool responses are rejected. Leo's setup and tool responses remain server-owned.
- Gemini tool calls are executed through the existing authenticated `/api/realtime/tools` endpoint, retaining current account and tool authorization checks.

### Live camera and screen understanding
- Added explicit **Share screen** and **Camera** controls to the live voice UI.
- The browser asks for permission using the native screen/camera permission flow.
- Video is sampled as JPEG frames at approximately one frame per second, resized to a maximum 768px longest edge, and sent over the same authenticated server-proxied WebSocket.
- Added a local preview and a visible Stop sharing control.
- Visual frames are not appended to LeonardX chat history by this implementation.
- The server independently enforces a one-frame-per-second limit and frame-size cap.

### Session continuity on Vercel Hobby
- The relay ends a connection before the Hobby Function's five-minute maximum.
- The client requests a fresh constrained Live credential and reconnects automatically.
- Gemini session-resumption handles are captured and supplied to the next session, preserving provider conversation context where Gemini accepts the resume handle.
- Existing audio capture, playback context, and active visual stream are reused during the reconnect.

## Files changed
- `app/api/realtime/socket/route.ts` — authenticated WebSocket relay and Gemini server connection.
- `app/api/realtime/session/route.ts` — short-lived HttpOnly cookies, constrained token configuration, session resumption and reconnect rate limit.
- `components/LEOWidget.tsx` — server-proxied audio transport, automatic reconnect, screen/camera controls, visual capture and preview.
- `lib/auth.ts` — support for the scoped realtime access cookie.
- `package.json` and `package-lock.json` — `@vercel/functions` and direct `ws` dependency.
- `tests/voice-shared-orchestration.test.mjs` — relay, auth, visual-input and reconnect regression assertions.

## Verification
- Focused voice regression suite: **9 passed, 0 failed**.
- Full repository test suite: **457 passed, 9 failed, 2 skipped**. All nine failures are test-process dependency-loading failures in this checkout (`zod`, `jszip`, `@google/genai`, `@modelcontextprotocol/sdk`, `ajv`, and `undici` are not installed); the workspace has no `node_modules`.
- TypeScript/TSX syntax transpilation: passed for all four changed implementation files.
- `package.json` and `package-lock.json`: valid JSON.
- Full TypeScript typecheck and Next.js production build: **not completed** because dependencies are absent. An offline npm lockfile install was attempted but could not complete because the environment has no cached registry packages.
- Live Gemini upstream handshake, real browser microphone, camera/screen permissions, Vercel WebSocket upgrade, and end-to-end session resumption: **not tested against a deployed staging environment**.

## Deployment status
- No GitHub commit, push, pull request, Vercel deployment, or production change was performed.
- Before production release, install dependencies and run `npm run typecheck`, `npm run build`, the focused test suite, then test the live audio/video relay on a Vercel preview deployment with the server-side `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and `LEO_GEMINI_LIVE_MODEL` configured.
- Vercel Hobby functions are limited to 300 seconds with Fluid Compute. The implementation reconnects before that limit; it does not create an unlimited persistent socket.
