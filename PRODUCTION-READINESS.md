# LeonardX production release gates

## Current implementation status

This repository now includes a durable, owner-only role task queue for the 160 role definitions, atomic database claims, dependency gating, bounded retries, lease recovery, server-side local text-model selection, a readiness probe, and CI verification configuration. These are code changes; they do not mean that the production service has been configured, migrated, deployed, load-tested, or security-audited.

The role queue currently performs text-model work only. It does **not** grant the roles repository, shell, Git, browser, or database tools. Do not present its outputs as code that was executed or as files that were changed.

## Required environment

Set deployment secrets in the hosting provider's encrypted environment settings, never in source control:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OWNER_EMAIL` (the exact verified platform-owner email)
- `CRON_SECRET` (at least 32 random characters)
- One text provider: `OPENAI_API_KEY`, `LEO_API_KEY`, or `LEO_LOCAL_MODEL_URL`
- `AGENT_WORKER_ENABLED=true`
- `WORKFLOW_WORKER_ENABLED=true`
- `WORKFORCE_WORKER_ENABLED=true`
- `LEO_LOCAL_MODEL_NAME` and optionally `LEO_LOCAL_MODEL_API_KEY` when using an OpenAI-compatible local text server

`LEO_LOCAL_MODEL_URL` is only for a server-side local text-model endpoint reachable from the application server. The model server must implement OpenAI-compatible chat completions. Hosted tools, live web research, image/video generation, realtime sessions, transcription, and speech generation still need their respective supported providers and network access. A web-hosted application does not become device-offline merely because a local model URL exists.

## Database release sequence

1. Apply the outstanding Supabase migrations to a **staging** database first, in filename order. The new worker migrations are `20261014120000_production_workforce_hardening.sql` and `20261014130000_durable_workforce_role_jobs.sql`.
2. Verify RLS, service-role-only queue mutation, the atomic claim RPCs, and owner/device authorization in staging.
3. Back up production and review the migration diff. Apply the same migrations through the team's approved migration workflow. Do not run raw migration SQL manually against production without review.
4. Confirm `/api/health/ready` returns HTTP 200 only after the required tables, columns, provider settings, worker flags, and scheduler secret are present.

## Worker scheduling

The cron entries in `vercel.json` are set to run once per day to support Vercel Hobby deployments, which reject schedules more frequent than daily. Hobby invocation timing may vary by up to 59 minutes. This cadence is not suitable for timely webhook retries or durable worker queues; use a Vercel plan with per-minute cron support or a protected external scheduler for those workloads. Keep workers disabled until migrations and scheduler credentials are installed.

## CI and release checks

- Run `npm ci` from the committed lockfile.
- Run `npm run verify` (typecheck, lint, tests, production build).
- Run `npm run preflight:production` with deployment environment settings present; this checks static settings, not provider validity.
- Run the app in staging and verify `/api/health/ready` returns HTTP 200.
- Exercise queue concurrency, crash/lease recovery, dependency failure, retries, owner authorization, plan revocation, and tenant isolation.
- Run load and security tests, confirm backups/restore, alerting, rate limits, and rollback procedure.
- Only then promote the tested release and verify it with production smoke tests.

## Known production blockers

- This environment has not applied any migrations or connected to the live Supabase/OpenAI deployment.
- Full `npm run verify` has not been proven in this environment; a successful CI run is required.
- Sandboxed repository editing, arbitrary code execution, tests inside an isolated execution container, and Git operations are not wired into the 160-role queue. Do not add shell execution to the Next.js web process. Implement that as a separate, hardened sandbox service with per-job isolation, no inherited secrets, CPU/memory/time limits, network policy, audit trail, and disposable workspaces before enabling it.
- Fully device-offline inference/task execution and robust local/cloud outbox synchronization are not complete. A local model endpoint only enables server-side text inference when that endpoint is reachable.
- Animated participant cards and browser speech playback are not generated video avatars or a full duplex realtime meeting system.

Therefore, the release is **not production-ready until all deployment-specific gates above pass**.


## Follow-up hardening completed on 2026-10-14

- [x] Owner identity fails closed when `OWNER_EMAIL` is missing.
- [x] Credit access, dashboard owner status, project setup, build/deploy and 2FA enrollment use the shared owner authorization policy.
- [x] Durable workforce worker uses the shared owner identity policy.
- [x] Stale worker leases cannot falsely report a result as persisted.
- [x] Task dependencies cannot cross project-memory scopes.
- [x] Owner-only cancel/retry task lifecycle endpoint with compare-and-set state transitions.
- [x] UI controls for cancelling queued jobs and retrying eligible failed/blocked jobs.
- [x] Regression tests for owner identity, lease persistence, project-scope dependencies and task transitions.

## Still release-blocking

- Full dependency installation, typecheck, lint and production build must pass in CI.
- Apply all migrations in staging and test real Supabase/OpenAI/local-model integrations.
- Implement and security-test the isolated repository/shell/Git execution service; the current role queue deliberately has no shell or repository tools.
- Implement genuine offline inference/task execution plus robust local/cloud sync; current offline prompt drafts and local-model adapter are not full offline operation.
- Verify independent worker scheduling, restart recovery, concurrency limits, rate limits, observability, and backup/restore under load.
- Implement full interactive video avatars and realtime duplex spoken meetings if required for the launch scope.
- Obtain explicit release approval before applying production migrations or deploying.


## Build/environment follow-up — 2026-10-14

The reported TypeScript diagnostics have been corrected in source, and the documented lint findings were addressed. Regression tests now cover those corrections. `OWNER_EMAIL` is set to `leonardudoh5@gmail.com` in `.env.example`; production configuration still must be set in Vercel. CI uses dummy values intentionally and must not be populated with production secrets. `LEONARDX_URL` and `LEONARDX_BASE_URL` stay at localhost in local `.env.local`; set both to `https://leoos-omega.vercel.app` in the Vercel Production environment.

The contact page uses Web3Forms. Lead capture stores records in Supabase and treats Resend email as optional; SMTP transport is not currently implemented in this repository. Full semantic typechecking/lint/build is still blocked here by dependency installation timeout, and staging migrations, live integration tests, load tests, and deployment remain outstanding.


## Pass 5 deployment gates

- [ ] Deploy the isolated runner on a dedicated rootless-Podman VM, restrict its private network, set HMAC and exact repository allowlist, then penetration-test before enabling the web proxy.
- [ ] Configure `LEO_LOCAL_MODEL_URL` on a local app deployment and test `LEO_OFFLINE_MODE=true`; do not assume a Vercel app can reach laptop localhost.
- [ ] Apply offline outbox and worker-heartbeat migrations in staging.
- [ ] Configure and test SMTP over port 465 or 587 STARTTLS.
- [ ] Test full-duplex realtime meeting sessions and Runway avatar clips with provider credentials.
- [ ] Run `npm ci`, `npm run verify`, `npm run test:staging`, and bounded staging worker load tests in a network-enabled environment.
- [ ] Review the role execution planner's output and keep tool access deny-by-default; do not describe it as 160 independent agents.
