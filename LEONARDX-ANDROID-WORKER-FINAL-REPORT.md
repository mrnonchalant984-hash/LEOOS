# LeonardX Android worker — final implementation and gap report

**Prepared:** 2026-10-19  
**Target job:** `21d27a24-db9e-40ad-b58e-166eb0a013d8`  
**Expected project:** `9901ac0c-a733-478a-a84f-7b31948e16d3`

## Finding: why the existing job is still queued

The authenticated LeonardX status tool re-read the specified job and returned the expected project ID, `status=queued`, `progress=0`, `attempts=0`, `error=null`, `size_bytes=null`, `sha256=null`, `completed_at=null`, and `download_url=null`. This read is scoped to the currently authenticated LeonardX account. No reset, replacement job, or cancellation was performed.

The current public GitHub `main` branch contains `.github/workflows/android-calculator-acceptance.yml`, which builds a throwaway calculator APK for CI, but does **not** contain `.github/workflows/android-build-worker.yml` or `scripts/android-build-worker.mjs`. The Actions run history contains CI and calculator acceptance runs, but no Android queue-worker run. The acceptance workflow's latest observed run (run `39253397486`) passed Java/SDK/Gradle setup, calculator tests, a real Gradle build, APK archive/checksum validation, and uploading a GitHub Actions artifact; it does not claim or finalize the specified production job.

The production Android capability probe reports `java=false`, `gradle=false`, `androidSdk=false`, and `buildable=false`, while artifact-storage credentials are present. Therefore, the Vercel serverless route cannot compile the APK in the current production runtime. The route now fails closed when those tools are absent rather than claiming a queued job and then failing during compilation.

**Root cause established from available evidence:** the production job has no active queue consumer proven to poll it. The hosted worker implementation exists in this ZIP, but is not present on the currently observed GitHub default branch. Missing GitHub Actions secrets or an unapplied production migration remain unverified because those settings and the production database migration ledger cannot be read from this session.

## Implementation included in this ZIP

- `.github/workflows/android-build-worker.yml`: separate GitHub-hosted Ubuntu worker on a five-minute GitHub Actions schedule plus manual dispatch; serialized workflow executions; JDK 17, Android API 35/build-tools 35.0.0, and checksum-verified Gradle 8.9.
- `scripts/android-build-worker.mjs`: claims at most one durable job through the atomic Supabase RPC; validates the owner-scoped project source; compiles with Gradle; verifies ZIP integrity, APK signature, package ID, file size, and SHA-256; stores the APK in private `leo-files`; finalizes only while the worker still owns a live lease; sanitizes errors; and updates project status/progress.
- Crash recovery: before recompiling, the worker checks for a previously uploaded APK under the exact owner/job path, verifies its bytes/signature/package metadata/checksum, and finalizes the verified artifact if found. New artifact names include the checksum to avoid stale-worker overwrites.
- `supabase/migrations/20261019180000_android_worker_reliability.sql`: records `started_at`, recovers expired leases, bounds retries to three attempts, and atomically finalizes success/retry/failure only for the worker holding a live lease. Apply this migration to the authoritative database before enabling the worker; do not assume the migration has already been applied.
- Tests cover the worker trigger, serialization, claim/lease/finalization protections, existing-artifact recovery, private owner-scoped download verification, serverless fail-closed behavior, and unchanged Vercel Cron configuration.
- `ANDROID_HOSTED_WORKER_ENABLED` is a non-secret operator declaration for capability discovery. Set it to `true` only after the worker workflow is on `main`, the required GitHub Actions secrets are configured, and the relevant database migrations are applied. It is not a live health check.

## Vercel Hobby Cron

**`vercel.json` was not changed.** Its existing daily schedules remain unchanged. The five-minute schedule belongs to GitHub Actions, not Vercel Cron; it does not require a Vercel Pro plan.

## Required safe activation steps

1. Merge/apply the ZIP changes into the real working tree while preserving any newer local changes; this extracted ZIP has no `.git` directory, so local uncommitted Git changes could not be inspected from this session.
2. Review and apply the forward-only migration `supabase/migrations/20261019180000_android_worker_reliability.sql` to the **same production Supabase project** used by LeonardX. Verify the queue migration and private `leo-files` bucket are already in place.
3. Add GitHub Actions repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for that same Supabase project. Secret values must remain in GitHub Settings; do not paste them into chat or logs.
4. Put `.github/workflows/android-build-worker.yml` and `scripts/android-build-worker.mjs` on the repository's default branch (`main`). Then run the workflow manually once from GitHub Actions and inspect the run's sanitized logs. The schedule will subsequently poll about every five minutes, subject to GitHub Actions scheduling delays.
5. After steps 2–4 are verified, set `ANDROID_HOSTED_WORKER_ENABLED=true` in Vercel and redeploy only with explicit operator authorization. This does not alter `vercel.json`.
6. Re-read the exact existing job ID. The worker should claim it if it remains eligible and its attached project is owned by the job owner. Verify persisted `completed`, `size_bytes`, and `sha256`, then download through the authenticated LeonardX artifact endpoint and compare the downloaded bytes' SHA-256 to the database value.

## Verification results and boundaries

- `node --check scripts/android-build-worker.mjs`: **passed**.
- `node --experimental-strip-types --test tests/android-build-worker.test.mjs tests/android-build.test.mjs tests/application-capabilities.test.mjs`: **18 passed, 0 failed**.
- `npm test`: **235 passed, 4 failed, 2 skipped** out of 241. The four failures could not load dependencies absent from this extracted environment: `jszip`, `@modelcontextprotocol/sdk`, `zod`, and `undici`.
- `npm run typecheck`: **blocked** (`next: not found`).
- `npm run lint`: **blocked** (`eslint: not found`).
- `npm run build`: **blocked** (`next: not found`).
- `python -m unittest discover -s services/godot-build-service -p 'test_*.py'`: **10 passed**; a test fixture emits a duplicate ZIP-entry warning.
- `vercel.json` SHA-256 matches the base ZIP exactly: `54dfdb7c233b62636f9708c829440d4babf5a3205339cff046ce84198f7e47a6`; no Vercel Cron schedule was changed.
- A prior GitHub Actions calculator acceptance run succeeded and built a real APK for the CI artifact. It is not the specified production job's artifact and must not be substituted for it.
- No production worker run, production migration, production state mutation, APK upload for the specified job, authenticated download, or deployment was performed from this session.
- No APK size/checksum/download link is claimed for the specified job because the authoritative status still has no artifact metadata.
