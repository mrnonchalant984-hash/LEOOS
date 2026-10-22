# LeonardX one-click build and Gemini fallback upgrade

## Included in this source update

- Chat greeting behavior is limited to the first turn of a new conversation; owner greeting is distinct and non-owner greetings use neutral language. The system prompt explicitly prohibits the combined “sir/ma” wording.
- The existing project setup flow now asks project-type-specific requirements for mobile apps, games, web apps and SaaS, including screens, navigation, design direction, roles/data, integrations and platform targets.
- New mobile starter projects derive screen names, features, palette and design direction from the user's brief and no longer ship the default Expo counter demo. Account-specific Expo identifiers remain unset until supplied.
- Website setup offers “Allow once”, “Allow always” (saved in this browser), or “Ask every time”. “Allow once” and “Allow always” auto-start the existing verified build/deploy workflow after the project is saved. The server remains authoritative for plan access, provider readiness, idempotency and monthly build allowance.
- Gemini is available as the cross-provider fallback for chat, regular specialist agents, website generation, still-image generation, and turn-based voice transcription/chat/speech. Missing-model (404) provider failures can trigger fallback; malformed requests and authentication failures do not silently retry.
- Voice upload processing now requires authentication and is rate-limited. The existing OpenAI Realtime WebRTC mode remains preferred when it works; Gemini can provide a secure turn-based fallback without exposing the Gemini key to the browser. Video generation is deliberately excluded from the Gemini image fallback.
- Environment examples document optional Gemini image, audio and TTS model overrides.

## Configuration still required

Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in the server environment for Gemini fallback. Confirm the selected Google models are available to that API key and project. Configure OpenAI or another primary provider as desired. For recurring durable agent jobs, configure the protected GitHub Actions secrets `LEONARDX_BASE_URL` and `CRON_SECRET`, and confirm the production database migrations have been applied.

## Verification performed in this workspace

- 14 focused tests passed for the agent queue contract, Expo requirements-driven starter, Gemini provider integration and provider fallback behavior.
- The full test command reached 252 tests: 246 passed and 2 were skipped; four test files could not start because dependencies were not installed (`jszip`, `@modelcontextprotocol/sdk`, `zod`, `undici`). `npm ci --offline` could not complete because the package tarball cache is incomplete.
- TypeScript, lint, Next.js production build, live Gemini model access, Supabase queue execution, GitHub Actions scheduling and Vercel deployment were not verified in this environment. No deployment or live provider success is claimed.
