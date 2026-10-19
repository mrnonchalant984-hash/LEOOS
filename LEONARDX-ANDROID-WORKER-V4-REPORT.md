# LeonardX Android Worker — Version 4 Gap-Fix Package

**Prepared:** 2026-10-19  
**Base:** `LeonardX-Android-Worker-Final-Implementation-v3.zip`  
**Repository:** `mrnonchalant984-hash/LEOOS`  
**Existing calculator job:** `21d27a24-db9e-40ad-b58e-166eb0a013d8`  
**Project:** `9901ac0c-a733-478a-a84f-7b31948e16d3`

## Current production status (read-only check)

The existing job was checked again through LeonardX. It remains `queued`, progress `0`, attempts `0`, with no error, completion timestamp, size, checksum, or download URL. This package did not reset, duplicate, claim, or otherwise mutate the production job. No APK is being claimed as available for this job.

## What Version 4 changes

Version 4 builds on the complete Version 3 source package and adds a fail-fast, read-only preflight before the hosted worker attempts to claim a job:

- **New `scripts/android-worker-preflight.mjs`:** validates that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exist without printing their values; checks that the expected Android queue columns are present (including `started_at` from the reliability migration); and verifies that `leo-files` exists and is private.
- **Worker workflow updated:** `.github/workflows/android-build-worker.yml` runs the preflight before `scripts/android-build-worker.mjs`. This should surface a wrong Supabase project, missing migration, missing bucket, or public bucket before the queue worker claims work.
- **Regression test added:** checks the preflight runs before the worker and verifies the schema/bucket/private-storage assertions.
- **Existing worker protections retained:** atomic claims, lease heartbeat/finalization, bounded retries, owner/project scoping, APK ZIP/signature/package-ID verification, immutable checksum-named artifact storage, and authenticated owner-only download.

This preflight is read-only. It does **not** execute the claim/finalization RPCs and does not prove a build or download succeeded; the worker logs and completed-job status must still be checked.

## Verification run for Version 4

- `node --check scripts/android-worker-preflight.mjs`: **passed**.
- `node --check scripts/android-build-worker.mjs`: **passed**.
- `node --experimental-strip-types --test tests/android-build-worker.test.mjs tests/android-build.test.mjs tests/application-capabilities.test.mjs`: **19 passed, 0 failed**.
- Full repository test/build/typecheck/lint results are not upgraded by these focused tests. The prior extracted environment was missing installed dependencies, so the broader checks remain blocked until dependencies can be installed and those commands are rerun.
- No live Supabase migration or secret configuration was changed. No deployment, GitHub commit, or production build was initiated.
- `vercel.json` is preserved unchanged from Version 3. Its six existing daily schedules were not edited.

## Remaining blockers before the existing job can complete

1. Apply and verify the queue and reliability migrations in the **same** Supabase project used by LeonardX. Do not blindly reapply SQL if the migration ledger differs; reconcile first.
2. Configure GitHub Actions repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for that same project. Never put secret values in source code, reports, or chat.
3. Add the worker workflow and worker script to the repository default branch. GitHub scheduled workflows run from the default branch; a ZIP by itself does not activate the workflow.
4. Run the workflow manually once, then inspect its logs for the read-only preflight result and actual claim/build/finalization result. The workflow schedule is GitHub Actions (`*/5 * * * *`), not Vercel Cron, and may be delayed by GitHub.
5. Only after verifying the above, configure `ANDROID_HOSTED_WORKER_ENABLED=true` in Vercel and redeploy through the normal approved process if required. This setting is a capability declaration, not a health check.
6. Re-read the exact existing job. Confirm `completed`, non-zero `size_bytes`, a 64-character SHA-256, and a download URL. Download through LeonardX's authenticated artifact endpoint and compare the downloaded bytes' SHA-256 to the stored checksum.

## Vercel Hobby plan protection

No Vercel cron schedule was added, removed, or changed in Version 4. The five-minute queue poll belongs to GitHub Actions, not Vercel Cron. Keep `vercel.json` as supplied unless a separate, explicitly approved change is required.

## Honest release decision

**Implementation package updated; production completion remains unverified.** Version 4 improves preflight diagnostics but cannot independently set GitHub repository secrets, apply a production migration, deploy code, or prove the existing production job finished. The calculator job is still queued at the latest check, so no APK download link or checksum is claimed.
