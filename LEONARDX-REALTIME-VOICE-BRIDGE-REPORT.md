# LeonardX — Secure Realtime Leo Voice Bridge

## Current status correction

**The realtime bridge described below is not operational in the current source tree.** `POST /api/realtime/session` returns `gemini_turn_based`, does not mint a Live credential or set the cookies required by the socket route, and the widget therefore uses `/api/voice` instead of opening a WebSocket. The socket route is Vercel-specific; no dedicated Cloudflare Worker or Cloudflare routing integration exists. Treat the architecture below as a design target, not a verified implementation.

The currently active voice path is turn-based: `/api/voice` authenticates each request, transcribes audio, and sends chat-mode turns through the shared Leo prompt, knowledge, and authorized tool orchestration before speech synthesis.

## Intended architecture (not yet implemented end to end)

## Architecture

1. `POST /api/realtime/session` authenticates the user, applies a per-user rate limit, and reads only that user's chat history and active memories.
2. It retrieves curated LeonardX knowledge, reuses `getLeoSystemPrompt()` and `LEO_PLAN_TERMINOLOGY`, and builds tool declarations from the existing `createUserAssistantTools()` registry.
3. The server mints a **single-use, short-lived Gemini Live ephemeral token**. The Live model, system instructions, voice, audio transcription settings, Google Search, and account-scoped function declarations are constrained into the token. The long-lived Gemini API key is never sent to the browser.
4. The browser uses that ephemeral token to establish the low-latency bidirectional audio session. Audio remains streamed to the Gemini Live endpoint; the browser does not receive a provider API key.
5. Function calls are sent to `POST /api/realtime/tools`. That endpoint re-authenticates the user, rate-limits calls, rebuilds the existing account-scoped registry, checks that the tool is still available for the current request, and invokes the existing executor. Existing project ownership, GitHub connection, MCP approval, agent entitlement, and agent API authorization checks remain in force.
6. Realtime user/assistant transcriptions are saved to the same `chats_v2` session through `POST /api/realtime/turn`, scoped to the authenticated owner. Main Chat can therefore load completed voice turns from the same conversation.

### Important transport distinction

This uses Google's documented client-to-server ephemeral-token pattern with a server-side authorization/tool bridge. The raw audio WebSocket is **not** proxied through a Next.js/Vercel function. That would require a separately hosted persistent WebSocket relay (for example, a dedicated worker/service) and its operational infrastructure. The current design keeps the provider secret and all privileged tools server-side while retaining low-latency audio streaming. Do not describe it as a raw-audio server proxy.

## Shared capabilities

- Same system prompt and LeonardX platform terminology as Main Chat.
- User-approved persistent memories, curated knowledge retrieval, and recent session history.
- General knowledge explicitly enabled; Leo should answer general educational, scientific, technical, creative, and everyday questions, not only LeonardX questions.
- Google Search tool for research.
- Existing account-scoped project, deployment, GitHub, and approved read-only MCP tools.
- Existing specialist-agent run tool declaration; server execution is enabled only when the user's spoken transcript explicitly requests running/executing an agent, and the existing agent API enforces permissions.
- New `inspect_public_website` tool added to the shared orchestration registry. It uses the existing hardened public-site fetcher and returns static HTML-derived title, description, headings, and text. It blocks private/localhost targets and unsafe redirects. It is **not** a full interactive browser automation session.
- Existing live audio streaming, voice activity detection, interruption handling, and local playback queue cancellation are retained in the widget.

## Changed files

- `app/api/realtime/session/route.ts` — secure ephemeral session creation and shared context/tool declarations.
- `app/api/realtime/tools/route.ts` — authenticated server-side tool-call bridge.
- `app/api/realtime/turn/route.ts` — account-scoped shared chat-history persistence.
- `lib/ai/tool-orchestrator.ts` — shared safe public-website inspection tool.
- `app/api/chat/route.ts` — exposes the same public-site inspection tool in Main Chat when a public URL is supplied.
- `components/LEOWidget.tsx` — realtime Live connection, tool-call round trips, transcript capture/persistence, and interruption handling.
- `.env.example` — documents `LEO_GEMINI_LIVE_MODEL` (default `gemini-3.8-live`).
- `tests/voice-shared-orchestration.test.mjs` — regression assertions for constrained token, server tool bridge, shared website inspection, chat persistence, and audio interruption.

## Verification performed

- Focused regression tests: **19 passed, 0 failed** (`voice-shared-orchestration` and `model-provider-registry`).
- TypeScript syntax transpilation: passed for all five changed TypeScript/TSX implementation files.
- Full typecheck/build: not run because this workspace does not have `node_modules` installed.
- Live Gemini Live session, real microphone streaming, interruption, real Supabase writes, real MCP/GitHub calls, and agent execution: **not yet tested against a live authenticated deployment**.
- The requested ten-question comparison between Main Chat and Voice is therefore **pending**. The test plan is in `LEO-VOICE-PARITY-TEST-PLAN.md`.
- No production deployment, GitHub push, commit, or database migration was performed.

## Configuration

`GEMINI_API_KEY` (or `GOOGLE_API_KEY`) must be configured server-side. `LEO_GEMINI_LIVE_MODEL` defaults to `gemini-3.8-live`; verify that this model is enabled for the Google project and account before production use. Live audio and Google Search usage remain subject to the Google project's quota and billing configuration.

## Remaining parity boundary

The Main Chat tool registry does not currently expose a general interactive browser automation tool. This change adds a safe static public-site inspector to the shared registry and exposes it to Main Chat when the user supplies a public URL, so both interfaces can inspect public page content. If LeonardX later adds a browser automation provider to Main Chat's server-side tool registry, Voice will inherit it by using the same registry; it should not be independently reimplemented in Voice.
