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

- The contact page submits the message to `/api/contact` and uses `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` to deliver it through Web3Forms.
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

## Expo/EAS and Godot cloud builds

- Add `EXPO_TOKEN` only to the LeonardX Vercel server environment. Generate a least-privilege Expo access token in the Expo account that owns the app and verify the authenticated account can access each linked EAS project. LeonardX never returns this token. New mobile workspaces include a pinned Expo SDK starter with static `package.json`, `app.json`, and `eas.json`; owners must add the real Expo project UUID at `expo.extra.eas.projectId` and their own platform package/bundle identifiers. Dynamic `app.config.js/ts` files are rejected by the server-side adapter. Android preview requires `android.buildType: "apk"`; production uses the profile's configured EAS output (normally an app bundle). iOS builds still require appropriate Apple signing credentials in EAS.
- EAS builds are submitted through the pinned `eas-cli` dependency using `--json --non-interactive --no-wait`. The app verifies `EXPO_TOKEN` and project access with `eas project:info` before submitting, persists the remote build ID, polls `eas build:view`, and proxies artifacts only after checking project ownership. EAS account quotas, Apple/Google accounts, signing configuration, and EAS provider fees are separate. If a submission times out ambiguously, inspect Expo build history before submitting another build.
- The Godot API implementation and container recipe are in `services/godot-build-service`. The service is not deployed and has no URL yet. Deploy it as a single instance on an isolated Linux container host with durable volume, private HTTPS ingress, CPU/memory/PID limits, and working bubblewrap user/network namespaces. Godot project code runs in a no-network bubblewrap sandbox with only its isolated source/output directories writable. Check `/healthz` readiness after deployment; it stays false if the engine, templates, or sandbox are not available.
- Godot exports require an uploaded `project.godot`, export presets, and engine-matched export templates. The supplied Godot 4.7.2 worker image downloads only the 36 MiB Windows x86_64 template range from the official 1.2 GB template archive; its SHA-256, exact range size, decompressed size, and CRC are verified. The image currently supports only `Windows Desktop`, so set `GODOT_EXPORT_PRESETS=Windows Desktop` on the worker host. Set `GODOT_BUILD_SERVICE_URL` and the matching `GODOT_BUILD_SERVICE_TOKEN` in LeonardX's Vercel server environment. Android export also needs a compatible Android SDK/JDK; do not advertise Android presets until tested. Job status, bounded logs, idempotency, artifact bundles, authorized downloads, and cancellation of queued jobs are implemented. Artifacts are stored on the persistent service volume and expire after the configured retention period.
- The IDE game-image pipeline accepts user-supplied PNG, JPEG, and WebP files under `assets/`, stores them in the existing private `leo-files` bucket, and verifies MIME signatures, a 2 MB per-file cap, a 2 MB aggregate project cap, and SHA-256 again before packaging. `assets/.asset-manifest.json` is added to the build source archive. 3D model, audio, and animation upload workflows are not included yet.
- Apply `supabase/migrations/20261018150000_cloud_build_jobs.sql` and `supabase/migrations/20261018160000_godot_project_assets.sql` before enabling cloud build APIs or the game-image panel. The first migration creates owner-scoped build records and an atomic monthly build-allowance function; the second creates the owner-scoped game asset index and size-limited attachment RPC. Cloud builds use the existing monthly build count, not a new LeonardX credit price. Failed/cancelled jobs do not count toward that allowance.
- Mobile/game subscription access defaults off. Set `LEONARDX_MOBILE_APP_PLANS` and/or `LEONARDX_GAME_PLANS` only after commercial approval (supported values are `pro` and `business`; `standard` is always excluded). These flags grant feature access only; they do not add credit prices or change existing plan prices. Set `GODOT_BUILD_SERVICE_URL` to the actual assigned HTTPS origin and `GODOT_BUILD_SERVICE_TOKEN` to the same cryptographically random 32-byte-or-stronger bearer secret used by the service. Set `EXPO_TOKEN` separately. Never use `NEXT_PUBLIC_` for these credentials or commit values.
- `GET /api/builds/capabilities` and the existing pricing page report entitlement flags and whether the Godot service responds. Mobile project account/project access is verified against EAS when the owner requests a build. Do not interpret an unset token, unlinked project, unresponsive worker, or unverified export preset as an available build capability.
- Mobile and game projects opened in the IDE show their cloud-build history, submit controls, refreshed provider status, and owner-authorized artifact links. MCP clients can use `start_cloud_build` only with `mcp:write` scope and explicit `confirm: true`; `get_cloud_build_status` requires `mcp:read`. Both tools route through the same owner-scoped build APIs, plan checks, idempotency, rate limits, and monthly allowance as the dashboard. They do not expose provider credentials.

- Apply `supabase/migrations/20261014130000_durable_workforce_role_jobs.sql`, `20261014140000_offline_sync_outbox.sql`, and `20261014150000_workforce_worker_heartbeats.sql` in staging. The worker must be enabled only after the migrations and protected scheduler are configured. `/api/workforce/monitoring` provides owner-only queue samples and worker heartbeats.
- `/api/workforce/plan` builds a bounded dependency graph for the 160 role definitions. This is an execution plan; it does not instantiate 160 independent processes. The current durable worker still executes bounded text tasks, and does not automatically give roles repository, browser, shell, or database tools.
- `/api/meetings/[id]/realtime-session` creates a provider-backed full-duplex audio session for a private meeting. It needs hosted realtime-provider credentials and connectivity. `/api/workforce/avatars` requests a generated short avatar video from the configured Runway provider; it is a generated clip, not a live real-time video avatar.
- Run `npm run test:staging` only with `LEONARDX_STAGING_URL` pointing to staging. Run `npm run load:workforce` only with a separate staging URL, a staging-only `CRON_SECRET`, `LEONARDX_ALLOW_STAGING_LOAD=true`, and a low concurrency.
- `.github/workflows/staging-migrations.yml` is manual and defaults to dry-run. Configure `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` as GitHub Actions secrets in the protected `staging` environment. Enable the apply checkbox only after reviewing the dry-run output.
