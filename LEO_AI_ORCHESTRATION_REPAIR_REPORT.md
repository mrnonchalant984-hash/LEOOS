# LeonardX / Leo AI Build Progress and Durable Deployment Repair

Date: 2026-10-29

## Implemented in this patch

### 1. Persisted progress events
- Every persisted `project_builds` state transition now attempts to write a matching `deployment_events` row with build ID, status, step, and deployment ID metadata.
- The chat progress endpoint is authenticated and user-scoped. It reads the latest Leo queue job, its current build row, and only the deployment events associated with that queue job/build.
- Leo's chat UI polls this endpoint while a build request is in progress and displays the current step, saved event messages, retry status, and a link only when a verified HTTPS deployment URL is recorded.
- Queue acceptance is shown as `queued`, not as a completed deployment.

### 2. Durable background queue
- Added `leo_build_jobs` with owner/project scoping, unique idempotency, stored source payload, bounded attempts, lease owner/expiry, and terminal status.
- Added `claim_leo_build_jobs` using `FOR UPDATE SKIP LOCKED` to prevent two workers claiming the same job.
- Leo chat now queues explicitly requested deployments and returns HTTP 202 promptly rather than waiting for GitHub/Vercel build steps in the chat request.
- Added a protected internal worker endpoint and a serialized GitHub Actions schedule (every five minutes, plus manual dispatch). The worker rechecks project ownership, plan entitlements, provider readiness, source-file validation, and existing Vercel public-domain verification through the existing build/deploy route.
- Transient provider failures can be retried with a new per-attempt idempotency key, capped at three attempts. Jobs with exhausted attempts become terminal instead of remaining stuck.
- Queue payloads are restricted to Leo-chat generated source; the queue rejects environment/secret payloads.

### 3. Verification behavior
- The worker marks a queue job successful only when the existing deployment route confirms `success=true`, `status=deployed`, and an HTTPS `liveUrl` after Vercel readiness and public-domain verification.
- A queued, building, or Vercel-accepted state is not reported as a live website.
- The existing app/backend and build pipeline are reused; no new Railway/Render service or isolated repository runner was introduced.

## Files changed/added
- `app/api/build-deploy/route.ts`
- `app/api/chat/route.ts`
- `app/api/chat/build-progress/route.ts` (new)
- `app/api/internal/builds/worker/route.ts` (new)
- `components/LEOWidget.tsx`
- `lib/ai/tool-orchestrator.ts`
- `.env.example`
- `.github/workflows/leo-build-queue-worker.yml` (new)
- `supabase/migrations/20261029190000_durable_leo_build_jobs.sql` (new)
- `tests/leo-build-queue.test.mjs` (new)

The ZIP also preserves the earlier Leo orchestration repair files (web search policy, Gemini integration/fallback, build tools, observability/readiness/cache/router helpers, and existing regression tests).

## Test results
- Focused regression tests: **23 passed, 0 failed**.
- Full test suite: **306 passed, 4 failed, 2 skipped** (312 tests). The four failures are the same pre-existing failures in `tests/expo-artifact.test.mjs`, `tests/mcp-protocol.test.mjs`, `tests/plugins.test.mjs`, and `tests/vercel-deployment-url.test.mjs`; they are not repaired by this patch.
- TypeScript/build verification: **not completed**. The extracted source snapshot has no `node_modules/.bin/next`, so typecheck/build cannot run in this environment.
- Supabase migration execution, GitHub Actions worker run, Vercel deployment, and real public URL verification: **not performed**. No live deployment is claimed.

## Required production rollout
1. Apply `supabase/migrations/20261029190000_durable_leo_build_jobs.sql` to the production Supabase project.
2. Confirm the GitHub repository Actions secrets `LEONARDX_BASE_URL=https://leoos-omega.vercel.app` and `CRON_SECRET` are configured. `CRON_SECRET` must be the same high-entropy value configured in the Vercel environment. Do not put the secret in client variables.
3. Deploy the patch to Vercel on a plan/runtime that supports the worker route's `maxDuration=300` setting. If the current plan caps functions below that duration, the build pipeline needs a shorter step-based execution design before long builds can be considered reliable.
4. Run the `LeonardX Leo build queue worker` workflow manually once after deployment, then verify a test deployment in Leo chat and inspect `leo_build_jobs`, `project_builds`, and `deployment_events`.
5. Verify the resulting HTTPS main domain is publicly reachable. The worker intentionally fails closed if Vercel is ready but public-domain verification fails.

## Deployment status
**Code patch prepared; not pushed or deployed.** The GitHub connector previously returned HTTP 403 during branch creation. The current remote `main` also has newer file versions than the local snapshot used for this patch, so replacing whole files directly on `main` would risk overwriting unrelated changes. Apply/rebase the patch against the current branch, run the full CI/build, and only then deploy. Live production acceptance remains unverified.
