# LeonardX Android Worker — Version 5: Hosted GitHub Actions Build Path

**Prepared:** 2026-10-20  
**Base:** `LeonardX-Android-Worker-Implementation-v4.zip`  
**Repository:** `mrnonchalant984-hash/LEOOS`  
**Existing calculator job:** `21d27a24-db9e-40ad-b58e-166eb0a013d8`  
**Project:** `9901ac0c-a733-478a-a84f-7b31948e16d3`

## What this version fixes

The MCP capability response was accurately reporting the Vercel runtime's missing local Java, Gradle, and Android SDK, but it did not describe the separate GitHub Actions worker path. That made the capability output incomplete for a hosted-worker architecture.

Version 5 adds explicit capability fields:

- `localBuildable`: whether this Node/Vercel runtime can compile locally.
- `hostedWorkerEnabled`: whether `ANDROID_HOSTED_WORKER_ENABLED=true` is configured. This is a configuration signal, **not** a live GitHub Actions health check.
- `buildMode`: `local`, `hosted-github-actions`, or `unavailable`.
- `buildable`: whether a local path or the hosted path is configured.
- `missing`: still lists local toolchain gaps for diagnosis.

It also corrects the capability check's storage-URL handling to accept either `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, and keeps the Vercel-only worker route guarded by `localBuildable`. Setting the hosted flag cannot accidentally cause Vercel to try running Gradle without a toolchain.

The package includes the GitHub Actions queue worker (`.github/workflows/android-build-worker.yml`) which installs Java 17, Android SDK API 35/build-tools, checksum-verifies Gradle 8.9, performs a read-only schema/private-bucket preflight, claims one queued job via Supabase RPC, builds the owned project, verifies APK ZIP/signature/package ID/SHA-256, and stores the artifact in the private `leo-files` bucket. The workflow runs independently of Vercel Cron.

## Live production check (read-only)

The LeonardX MCP capability check returned `java=false`, `gradle=false`, `androidSdk=false`, `artifactStorageCredentialsPresent=true`, `buildable=false`. The existing job remains `queued`, progress `0`, attempts `0`, no error, no checksum, no size, and no download URL. This is consistent with a worker that has not yet successfully claimed the job. **No APK is claimed as built.**

## Verification and limitations

- Source-level capability logic and regression tests were updated in the package.
- This ZIP is a source package only: it has not been pushed, merged, or deployed.
- No production Supabase migration, GitHub secret, Vercel environment variable, cron, job state, or artifact was changed by this package.
- The production MCP still reports the old response until these changes are reviewed, merged, and deployed.
- A live GitHub Actions run, actual APK, and authenticated download are not yet verified.

## Remaining repairs — do these in order

1. **Review and merge this package's source changes into the repository's default branch.** Do not overwrite unrelated user changes.
2. **Confirm both SQL migrations are applied in the exact Supabase project used by production:** `20261019120000_android_build_worker_queue.sql` and `20261019180000_android_worker_reliability.sql`. Check migration history first; do not blindly rerun SQL.
3. **Configure GitHub Actions repository secrets** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for that same Supabase project. Never paste the service-role key into source code or chat. Use least privilege available and rotate any exposed key.
4. **Enable Actions and run `LeonardX Android build queue worker` manually** once from the default branch. Inspect the preflight and worker logs. Expected output is either `claimed:false,status:idle` or the target job's ID and final status. A successful workflow that claims no job is not a successful APK build.
5. **Only after the hosted worker and secrets are confirmed, set Vercel environment variable** `ANDROID_HOSTED_WORKER_ENABLED=true` for the correct deployment environment and redeploy through the normal release process. This only declares the hosted path enabled; it does not prove the worker is healthy.
6. **Check queue admission and claimability.** Ensure the target job is still queued, has its project attached, has `available_at <= now()`, has not exhausted retries, and is in the same Supabase project configured in GitHub secrets. The worker claims the oldest eligible job, so another queued job could be picked first.
7. **Re-read the target job** and require `status=completed`, `progress=100`, positive `size_bytes`, a 64-character SHA-256, and a completed timestamp. Download through LeonardX's authenticated artifact endpoint as the owning user and independently hash the downloaded bytes.
8. **Run the broader project checks** (typecheck, lint, full test suite, production build) after dependencies are installed. The focused worker checks do not replace full CI.
9. **Confirm repository Actions minutes/usage.** The worker schedule polls every five minutes and can use runner minutes. It does not add or modify Vercel Cron jobs, but GitHub scheduled jobs may be delayed or disabled by GitHub policy/usage. If frequent polling is too costly, use manual dispatch or a supported queue-triggered mechanism instead.

## Vercel Hobby protection

No `vercel.json` changes are included. Keep the existing Vercel Cron schedule unchanged. The hosted build queue poll is a GitHub Actions schedule, not a Vercel Cron.

## Release decision

**Improved source package; production activation and APK delivery remain pending.** The next decisive proof is a successful GitHub Actions worker run that claims the existing job and finalizes a verified private APK, followed by a successful owner-authenticated download and checksum match.
