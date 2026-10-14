# LeonardX routing and local offline chat correction

## Admin/owner routing

- Root cause: the `/workforce` and `/meeting-room` client layouts called protected owner APIs without forwarding the active Supabase access token. On a 403 they explicitly navigated to `/agents`, making private admin pages appear to share the customer agent dashboard.
- Added `lib/client-auth.ts` to forward the active browser session token on same-origin API calls.
- Updated meeting room, workforce, engineer conversation, durable queue, monitoring and workflow studio requests to use that helper where appropriate.
- Removed automatic redirects to `/agents` from owner layouts. A signed-out user sees sign-in; an owner/device authorization failure gets an explicit diagnostic state and retry button.
- Added separate `/workforce/monitoring` dashboard and admin navigation links to Workforce, Jobs, Monitoring, Engineer Conversations, Meeting Room, Workflow Studio and Offline Work.
- Customer-facing `/agents` remains separate; owner routes still require the server-side owner and trusted-device checks.

## Offline AI

- Added `/offline/chat`, a separate local-model chat page whose conversation history is stored in browser local storage.
- Added `/api/offline/chat`, which requires `LEO_OFFLINE_MODE=true` and `LEO_LOCAL_MODEL_URL` and uses only the configured local text model. It has no hosted AI fallback and does not require cloud-backed account history for each chat message.
- Added `scripts/offline/setup-ollama.ps1` and `docs/OFFLINE-LOCAL-MODEL-SETUP.md` for installing Ollama and downloading `qwen2.5:3b` on Windows.
- The model weights are not part of the source ZIP. Download them once while online. To chat with mobile data disconnected, the Next.js app and Ollama must both be running locally. The Vercel-hosted app cannot load or call its server API without internet access.

## Verification

- Focused repository tests excluding `tests/plugins.test.mjs`: 128 passed, 0 failed.
- The plugin test file cannot run in this environment because the installed dependency tree is incomplete (`zod` unavailable).
- A full `npm run build` / semantic TypeScript check has not been completed in this environment; Next.js/TypeScript executables are missing from `node_modules`. Run the project's normal install, build and typecheck locally before pushing.
- No GitHub push, production deployment, Supabase migration, or live Ollama integration test was performed.
