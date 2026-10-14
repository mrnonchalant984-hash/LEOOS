# LeonardX production hardening pass — 2026-10-14

## Changes implemented

- Kept owner-only workforce and meeting APIs behind `requireOwner`, including trusted-admin-device enforcement when the owner's account has verified two-factor authentication.
- Kept customer agents on the existing `/agents` plan-entitlement path; the owner-only role queue is a separate API and database table.
- Added an owner-only durable task queue for role-defined specialists, including idempotency keys, bounded payloads, project ownership validation, dependency gating, atomic database claims, three-attempt retry limits, lease recovery, and persisted outputs.
- Added project-scoped task context. The worker revalidates project ownership and retrieves only that owner's global/project memories from the memory table.
- Added an atomic claim RPC for the existing asynchronous agent queue, including stale lease recovery and exhausted-attempt finalization.
- Hardened workflow execution by validating dependency graphs again in the worker, not only when workflows are created.
- Added a text-model adapter that can use an environment-configured OpenAI-compatible local model for text inference. The local URL is server configuration only; it is not accepted from user input. Hosted media/realtime/tool features still need their providers.
- Added `/api/health/ready`, which reports only readiness booleans and checks required database tables/columns and local model reachability when configured.
- Added a production preflight script, CI workflow, worker cron entries, environment template values, and a release-gate runbook.

## Verification performed here

- Focused source/unit suite excluding `tests/plugins.test.mjs`: **107 passed, 0 failed**.
- TypeScript/TSX syntax transpilation for 20 changed files: passed.
- Full `npm run verify`: **blocked** because `next` is not installed in this runtime (`sh: 1: next: not found`).
- `npm ci --ignore-scripts --no-audit --no-fund`: timed out while fetching dependencies; the environment could not complete installation.
- Full typecheck, lint, production build, live Supabase tests, and hosted-provider validation: not verified.
- No migrations were applied and no deployment was performed.

## Not yet production complete

These are actual remaining blockers, not cosmetic follow-ups:

1. The 160 role definitions can now be queued as persistent model-powered tasks, but the roles do not yet have independent repository, shell, Git, browser, or database tools. A secure external sandbox service is required before any role can edit repositories or execute untrusted code. Do not execute arbitrary code inside the Next.js application process.
2. Fully offline device inference, offline task execution, and reliable local/cloud outbox conflict reconciliation are not implemented. The local model adapter works only when the app server can reach a configured local model endpoint.
3. Meeting avatars are interface animations, not generated video avatars. Browser speech dictation and sequential spoken transcript playback are not full-duplex real-time meetings.
4. CI has been added but must run successfully on GitHub with dependencies installed. The migrations must be applied to staging, verified, then applied to production using the approved process.
5. The minute-level Vercel cron schedule requires a deployment plan that supports that cadence; otherwise an external protected scheduler must be configured.

**Release decision: NOT READY TO PROMOTE YET.** Production readiness requires the remaining sandbox/offline capabilities or an explicit scope decision to defer them, plus successful CI, staging migration, load/security tests, configured workers, readiness HTTP 200, and production smoke tests.


## Follow-up hardening pass — 2026-10-14

Additional changes made after the initial report:

- Removed the hard-coded platform-owner email fallback. `OWNER_EMAIL` must now be explicitly configured; an absent value fails closed.
- Centralized owner checks in credit/access decisions, dashboard status, project setup, build/deploy authorization and 2FA enrollment using `isPlatformOwner`; 2FA also requires the authenticated account email to match the owner profile.
- The durable workforce worker now uses the same shared `isPlatformOwner` policy as the request APIs.
- The worker verifies that its lease is still owned when persisting success or failure. A stale worker can no longer report success merely because an update returned no database error while matching zero rows.
- Workforce task dependencies are constrained to the same project-memory scope, preventing a project-scoped task from depending on a different project's output.
- Added an owner-only task transition endpoint for cancelling queued work and retrying failed/blocked work. Running jobs cannot be cancelled by a racy status flip; retries require all dependencies to have succeeded and start a fresh bounded attempt cycle.
- Added UI controls for the guarded cancel/retry transitions.
- Added focused regression tests for the above boundaries.

### Follow-up verification

- Focused source-level tests excluding `tests/plugins.test.mjs`: **112 passed, 0 failed**.
- TypeScript syntax transpilation for the changed TypeScript/TSX files: passed. Full `npm run verify` was attempted and stopped at `next: not found` during `next typegen`.
- Full `npm run verify` remains unverified because the local dependency installation is incomplete (`next` and `zod` are unavailable in this environment). No live database, provider, staging, or deployment verification was performed.


## Build and environment follow-up — 2026-10-14

- Fixed the six TypeScript diagnostics in the supplied build log: optional 2FA label validation, explicit meeting participant types, missing `getConfiguredModel` import, and missing `Workflow` icon import.
- Addressed the listed lint findings in the API plan redirect, workforce queue effect, owner workforce JSX text, Leo widget active-chat rendering and internal navigation links. Browser-storage restoration and remote pairing polling are scheduled asynchronously; the app no longer reads the active-chat ref during render.
- Changed lead capture so Supabase persistence is the success criterion and Resend is an optional notification. If a lead is saved but email notification is not configured or fails, the response reports `emailSent: false` instead of presenting the saved lead as a failed submission.
- Set `OWNER_EMAIL=leonardudoh5@gmail.com` in `.env.example` and documented Vercel environment configuration, CI placeholder values, local versus production URLs, and the current Web3Forms/Resend behavior.
- Added regression tests for the reported TypeScript blockers, owner configuration, CI placeholder credentials, and optional Resend notification behavior.

### Follow-up verification

- Focused source/unit tests excluding `tests/plugins.test.mjs`: **118 passed, 0 failed**.
- TypeScript/TSX syntax transpilation of the nine changed application files: passed. This is syntax validation, not a full semantic typecheck.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out in this runtime; `next` and `eslint` remain unavailable, so full `npm run verify` (semantic typecheck, lint, tests including plugin tests, and production build) is not verified here.
- No Supabase migration was applied, no live SMTP/Web3Forms/Paystack/OpenAI integration was exercised, and no production deployment or GitHub push was performed.


## Pass 5 — execution infrastructure, offline outbox, SMTP, realtime meeting sessions (2026-10-14)

### Added in source

- Added a separate HMAC-authenticated isolated-runner service under `services/isolated-runner`. It creates bounded no-network Podman containers for fixed operations (inspect, patch, test, typecheck, lint, build, Git status/diff/log/branch/commit), rejects secret-like workspace files, supports allowlisted GitHub clones, preserves runner workspaces with idle expiry, and never accepts arbitrary shell commands or performs remote pushes. Added owner-only web proxy `/api/workforce/repository-runner`. This service has **not** been deployed, threat-modeled by an external reviewer, or penetration-tested; the host's container-engine access makes dedicated-host isolation mandatory. Network-disabled tests also need a prebuilt dependency cache/image.
- Added an IndexedDB offline outbox and `/offline` local queue UI, idempotent `/api/offline/sync` endpoint, and migration `20261014140000_offline_sync_outbox.sql`. Rejected sync items stay on-device for review instead of being silently deleted. Drafts sync without auto-submission; owner workforce task requests are queued only after owner authorization. This is reliable bounded outbox synchronization, not a full offline cloud database replica or a fully offline cloud worker.
- Added `LEO_OFFLINE_MODE=true` fail-closed behavior so shared OpenAI hosted provider calls are not silently used when local text inference is unavailable. Local text inference still requires the application server to reach a configured local OpenAI-compatible model. A Vercel app cannot reach the user's own laptop `localhost`; fully offline use requires the app and model on the same local device/network.
- Added a role execution planner (`lib/agents/role-runtime.ts`) and owner-only `/api/workforce/plan`, validating role selection, dependencies, cycles, bounded concurrency (maximum eight), and deny-by-default tools. It plans execution across the 160-role catalog; it does not create 160 persistent independent agent processes or automatically grant tools.
- Added an owner-only full-duplex WebRTC audio meeting flow in the meeting-room UI and a Runway-backed generated avatar-clip form/endpoint. The clip endpoint does not provide a live video-call avatar. Hosted provider credentials and live integration testing are still required.
- Added TLS-only SMTP transport for port 465 or STARTTLS on 587 and wired optional lead/contact notifications. SMTP delivery was not tested against a real SMTP server. Lead persistence remains independent of notification success; Resend remains a fallback for lead notifications when SMTP is not configured.
- Added owner-only workforce monitoring endpoint and migration `20261014150000_workforce_worker_heartbeats.sql`; the worker writes heartbeat events. Added bounded staging worker load-smoke and health/readiness integration-smoke scripts, plus a manually triggered staging migration workflow whose default action is dry-run.

### Pass 5 checks performed

- Focused source/unit tests excluding `tests/plugins.test.mjs`: **128 passed, 0 failed**. The plugin test file could not be included because this runtime's partial `node_modules` does not include `zod`.
- Python runner syntax compilation and five isolated-runner archive/security unit tests: passed.
- TypeScript/TSX syntax transpilation for 13 new/changed TypeScript files: passed. This is syntax validation only, not a semantic typecheck.
- Full `npm run verify` remains unavailable: `next`, `eslint`, and `zod` are not installed in this runtime and network package installation times out. No full semantic typecheck, lint, production build, live SMTP/realtime/Runway/runner integration, or load test was completed.
- No migrations were applied to staging or production; no worker/runner deployment occurred; no GitHub push was performed.

### Current release status

**NOT READY FOR PRODUCTION PROMOTION.** The source now contains additional components for each requested area, but deployment-dependent verification remains. The 160-role system is still a bounded model-worker architecture rather than 160 independently operating engineers. Full offline task execution, true offline local/cloud database conflict resolution, live video avatars, runner security review, successful full CI, staging migrations, integration tests and load tests remain unverified or incomplete.
