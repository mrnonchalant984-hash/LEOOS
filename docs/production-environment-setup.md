# LeonardX production environment setup

## Platform owner identity

Set `OWNER_EMAIL=leonardudoh5@gmail.com` in the **server-side environment variables** for the Vercel project. This is the configured platform-owner identity; it does not create an admin account or bypass authentication. The matching account must sign in through the configured Supabase Auth provider, and the profile email must match. Do not set this value with a `NEXT_PUBLIC_` prefix.

## Local URLs versus Vercel URLs

- Keep `LEONARDX_URL=http://localhost:3000` and `LEONARDX_BASE_URL=http://localhost:3000` in your local `.env.local` while running the app on your computer.
- In Vercel Project Settings → Environment Variables, set both to `https://leoos-omega.vercel.app` for the Production environment. Use the matching deployment URL for Preview only if that workflow requires it.
- Do not use the production URL for staging load tests. Set `LEONARDX_STAGING_URL` to a separate staging deployment and explicitly enable staging load tests only when intended.

## GitHub Actions CI secrets

The current `.github/workflows/ci.yml` intentionally uses **dummy CI values**. Do not replace these with production secrets just to make typechecking, linting, unit tests, and the build run. CI should not need Paystack, Supabase service-role, OpenAI, SMTP, or Resend credentials for the static/unit verification workflow. Keep real credentials in Vercel server-side environment variables or in narrowly scoped GitHub Actions Secrets only for a future job that truly needs a live integration test. Never write real credentials into `ci.yml`, commit them, or expose them through `NEXT_PUBLIC_` variables.

## Current contact and lead delivery behavior

- The contact page submits the message to `/api/contact`. Web3Forms delivery runs server-side using `WEB3FORMS_ACCESS_KEY` (the legacy `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` is accepted for compatibility).
- Lead capture persists a lead to Supabase. Resend email notification is optional: when `RESEND_API_KEY` is not configured or delivery fails, a successfully stored lead still returns success with `emailSent: false`.
- Lead and contact notification now support an optional SMTP adapter using verified TLS: port 465 uses implicit TLS and port 587 requires STARTTLS. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `CONTACT_EMAIL` (or `OWNER_EMAIL`) on the server. Lead capture prefers SMTP when configured, then falls back to Resend; notification failure does not undo a successfully stored lead. Contact notifications are optional. `RESEND_API_KEY` remains used by other transactional notification paths that explicitly call the Resend API. Never place SMTP values in `NEXT_PUBLIC_` variables.
- Paystack payments require the server-side `PAYSTACK_SECRET_KEY`; configure the public key only where the client integration actually needs it. Do not put the secret key in a client-side or `NEXT_PUBLIC_` variable.

## Migration and deployment sequence

1. Configure Vercel environment variables without committing credentials.
2. Apply the repository's Supabase migrations to a staging project first.
3. Run `npm ci`, then `npm run verify` in a network-enabled environment.
4. Run integration tests against staging, verify the health/readiness endpoint, and perform bounded load testing against staging only.
5. Deploy only after verification succeeds and review the production readiness report for any remaining external prerequisites.

## Offline inference and sync

- `LEO_LOCAL_MODEL_URL` must point to a locally hosted OpenAI-compatible text model endpoint reachable by the **application server** (for example a local Ollama OpenAI-compatible endpoint). Set `LEO_LOCAL_MODEL_NAME` and, if needed, `LEO_LOCAL_MODEL_API_KEY`.
- `LEO_OFFLINE_MODE=true` disables hosted provider calls and refuses text inference when no local model URL is configured. It also disables hosted realtime/media routes through the shared hosted-provider client. The web app itself must run on a device/network that can reach the local model; a Vercel-hosted website cannot reach `localhost` on the user's laptop.
- The IndexedDB outbox stores drafts and owner workforce task requests locally and syncs them idempotently after connectivity returns. Drafts are not automatically submitted to Leo. Workforce tasks require the owner to authenticate again and are queued for the configured server worker after sync. This is an offline queue/sync path, **not** a complete offline copy of the cloud database or a fully offline worker deployment.
- Apply `supabase/migrations/20261014140000_offline_sync_outbox.sql` before enabling sync.

## Isolated repository runner

- Deploy `services/isolated-runner` on a dedicated disposable VM with rootless Podman, not on the Next.js production host. Build the fixed sandbox image from its Dockerfile. Use a private network and an authenticated TLS reverse proxy in addition to HMAC.
- Configure `REPOSITORY_RUNNER_URL` and a random `RUNNER_HMAC_SECRET` in the Next.js server environment. Configure the same secret and `RUNNER_ALLOWED_REPOSITORIES` on the runner host. Only allow exact GitHub repository slugs you own/control. No remote push is enabled; local status/diff/branch/commit operations stay in the isolated workspace.
- The sandbox has no network, drops Linux capabilities, runs non-root with resource limits, rejects secret-like files and never accepts arbitrary shell commands. Dependency installation is not supported inside the network-disabled sandbox; provide a reviewed prebuilt dependency image/cache or keep builds disabled until that is designed. Do not treat this component as deployed or penetration-tested until you deploy and test it.

## Workforce execution, monitoring and meetings

## Expo/EAS mobile builds and browser games

- Add `EXPO_TOKEN` only to the LeonardX server environment for the separate native mobile-app workflow. `EXPO_ACCOUNT_NAME` is optional when the token manages one account. Mobile app builds are not used by Browser Game Studio.
- Browser games use HTML5 Canvas for 2D and Three.js/WebGL for 3D starters. They run inside a restricted iframe sandbox, save source in the authenticated owner-scoped project workspace, and export actual source files through `/api/games/[id]/export`. The 2D starter uses procedural graphics; the 3D starter currently loads Three.js from jsDelivr unless it is bundled locally. A successful starter creation is not proof of browser QA, publication, or support for every custom mechanic.
- Browser game projects do not require Godot, Unity, Unreal, Android SDK/NDK, a native game build worker, Render, or Railway. Native engine compilation is retired from the active product flow. Historical migrations and existing engine-build metadata are retained for audit/backward compatibility; they do not constitute an active browser-game build dependency.
- `LEONARDX_GAME_PLANS` continues to control which plans may create game workspaces. The browser runtime does not introduce a new credit price or promise unlimited free AI, storage, or hosting usage.
- Existing Godot asset/build records are not automatically converted into browser source. Open legacy projects in the IDE only to inspect their saved files; create a new Browser Game Studio project or explicitly migrate source before expecting a playable preview.
- `/api/builds/capabilities` reports the Expo mobile provider separately from the browser-native game runtime. The MCP native build tools are limited to Expo; use `create_browser_game`, `start_browser_game_preview`, and `export_browser_game_project` for browser-game workflows. Production website deployment still requires the explicit deployment approval flow and a verified GitHub/Vercel result.

- Apply `supabase/migrations/20261014130000_durable_workforce_role_jobs.sql`, `20261014140000_offline_sync_outbox.sql`, and `20261014150000_workforce_worker_heartbeats.sql` in staging. The worker must be enabled only after the migrations and protected scheduler are configured. `/api/workforce/monitoring` provides owner-only queue samples and worker heartbeats.
- `/api/workforce/plan` builds a bounded dependency graph for the 160 role definitions. This is an execution plan; it does not instantiate 160 independent processes. The current durable worker still executes bounded text tasks, and does not automatically give roles repository, browser, shell, or database tools.
- `/api/meetings/[id]/realtime-session` creates a provider-backed full-duplex audio session for a private meeting. It needs hosted realtime-provider credentials and connectivity. `/api/workforce/avatars` requests a generated short avatar video from the configured Runway provider; it is a generated clip, not a live real-time video avatar.
- Run `npm run test:staging` only with `LEONARDX_STAGING_URL` pointing to staging. Run `npm run load:workforce` only with a separate staging URL, a staging-only `CRON_SECRET`, `LEONARDX_ALLOW_STAGING_LOAD=true`, and a low concurrency.
- `.github/workflows/staging-migrations.yml` is manual and defaults to dry-run. Configure `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` as GitHub Actions secrets in the protected `staging` environment. Enable the apply checkbox only after reviewing the dry-run output.
