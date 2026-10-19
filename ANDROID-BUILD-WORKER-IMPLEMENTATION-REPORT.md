# LeonardX Android worker fix — implementation and verification report

Date: 2026-10-19
Target existing job: `21d27a24-db9e-40ad-b58e-166eb0a013d8`
Target project: `9901ac0c-a733-478a-a84f-7b31948e16d3`

## Production evidence gathered

- The authenticated LeonardX Android capability tool reported `java=false`, `gradle=false`, `androidSdk=false`, and `buildable=false`. It reported artifact storage credentials present, but that does not prove the storage bucket or quota is healthy.
- The repository's current `vercel.json` did not contain a cron entry for `/api/workers/android-build`. Its existing daily crons do not poll the Android queue.
- The existing worker route ran Gradle in the web runtime and claimed a database job before discovering that the runtime did not have a usable Android toolchain. The route now fails closed before claiming when that toolchain is missing.
- The authoritative status tool was checked again after the local implementation: job `21d27a24-db9e-40ad-b58e-166eb0a013d8` remains `queued`, progress `0`, attempts `0`, error `null`, artifact size/checksum/download URL `null`, and `completed_at` `null`.
- Production runtime logs, GitHub Actions secret configuration, migration history, and production deployment settings were not available to this local ZIP-building process. No claim is made that the worker has run in production.

## Implemented in this ZIP

- `.github/workflows/android-build-worker.yml`: recurring five-minute hosted worker plus manual dispatch. Uses GitHub-hosted Ubuntu rather than assuming Vercel is a persistent Android build host.
- `scripts/android-build-worker.mjs`: atomically claims one queued job, loads only the job's project under its owner ID, validates source paths and expected calculator package, compiles with Gradle, checks APK ZIP integrity, verifies the Android APK signature and package metadata, computes SHA-256, uploads to the existing private `leo-files` bucket, and commits completion only while the same worker still owns a live lease.
- `supabase/migrations/20261019180000_android_worker_reliability.sql`: adds `started_at`, recovers null/expired leases, prevents stale workers extending leases, and adds service-role-only atomic finalization for success/retry/failure.
- `lib/android-build-worker.ts` and `app/api/workers/android-build/route.ts`: prevent incompatible serverless runtimes from claiming jobs and use lease-owned atomic finalization.
- `app/api/builds/android/[id]/artifact/route.ts`: preserves old artifact paths and authorizes immutable checksum-named paths; downloads remain authenticated and re-verified.
- `app/api/builds/android/[id]/route.ts`: returns `started_at` with the owner-authorized status.
- Focused regression tests and setup/operations documentation were added. The previous combined Godot Docker and durable agent queue fixes remain included in the ZIP.

## Required production activation steps

1. Review and merge/copy this ZIP's changes into the actual working tree without overwriting unrelated local edits.
2. Apply and verify `supabase/migrations/20261019180000_android_worker_reliability.sql` against the same Supabase project used by LeonardX. Verify the earlier Android artifact and worker queue migrations are already applied and `leo-files` remains private.
3. Ensure `.github/workflows/android-build-worker.yml` is on the repository's default branch and GitHub Actions/scheduled workflows are enabled.
4. Add GitHub Actions repository secrets named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Values must target the intended production Supabase project. Never commit or paste the secret values. The workflow passes credentials only to the worker step; the worker removes them from the environment passed to Gradle.
5. Manually dispatch **LeonardX Android build queue worker** once, inspect its run logs for the existing target job ID, then verify the authoritative job row/status endpoint and authenticated download bytes/checksum. The five-minute schedule then continues polling automatically.
6. Do not create a replacement job. The worker should claim the existing queued job when the corrected worker is active and the migration/secrets are correct.

## Verification results

- `node --check scripts/android-build-worker.mjs`: passed.
- `node --experimental-strip-types --test tests/android-build.test.mjs tests/android-build-worker.test.mjs tests/agent-queue-scheduler.test.mjs`: 16 passed, 0 failed.
- `python -m unittest discover -s services/godot-build-service -p 'test_*.py'`: 10 passed. One existing test fixture emitted a duplicate ZIP-entry warning.
- Full `npm test`: 237 tests; 231 passed, 4 failed, 2 skipped. The four failures are environment/dependency failures because this extracted ZIP has no installed `node_modules`: `jszip`, `@modelcontextprotocol/sdk`, `zod`, and `undici` are missing.
- `npm run typecheck`: unable to run because `next` is not installed.
- `npm run lint`: unable to run because `eslint` is not installed.
- `npm run build`: unable to run because `next` is not installed.
- A real APK compilation, APK signature/package validation against generated bytes, emulator/device test, production migration, production worker run, and authenticated production download were **not** performed. This environment has Java but no Gradle, Android SDK, Docker, or Podman.

## Release state

This report and ZIP contain local source changes only. No GitHub commit/push, Vercel deployment, production secret change, production database migration, job reset, or replacement job creation was performed. Success criteria are not met until the existing job reaches persisted `completed` state and the authenticated downloaded APK bytes match the stored SHA-256.
