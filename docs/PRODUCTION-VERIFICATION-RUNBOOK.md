# LeonardX production verification runbook — laptop handoff

This archive contains implementation and verification tooling for the remaining release gates. **No dependencies were installed and none of the commands below were run during this ZIP update.** Use a staging Supabase project, staging Vercel deployment, staging provider keys, and disposable test accounts. Do not point destructive acceptance tests at production.

## 0. Owner release-readiness UI

After signing in with the platform-owner account and completing the existing Admin 2FA device check, open `/admin/release-readiness`. This read-only page summarizes the remaining acceptance gates, provides safe environment-presence indicators, and offers copyable local commands. It does not run tests, migrations, provider calls, GitHub writes, or deployments. A green configuration indicator means only that a variable is present; it is not a passing integration test.

## 1. Install on the laptop

```bash
npm ci
npm --prefix extensions/leocode ci
```

Then run the repository's existing checks when ready:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run verify
```

## 2. Build/deployment HTTP 500 diagnosis

The build route now returns a retryable `503` for build-admission RPC/database failures instead of masking those infrastructure failures as `500`. Project lookup failures also return a correlated `503`. Provider errors retain provider status and request IDs; unknown build-stage errors return a correlated `502`/`503` rather than implying a successful deployment.

For each staging failure, record the `X-Request-ID` response header and match it against Vercel function logs. Check, in order:

1. `start_customer_project_build_idempotent` exists in the remote database and its service-role execute grant is present.
2. The newest build/idempotency migrations are applied in order; run `npm run db:dry-run` before any staging migration push.
3. The authenticated user owns the `website_projects` row and the `owner_user_id` column matches the profile UUID.
4. `GITHUB_TOKEN` / connected GitHub token has private-repository create + Git data write permissions; `VERCEL_TOKEN` has project/deployment permissions and the correct team scope.
5. Gemini build generation returns parseable JSON and the required file set; provider quota/rate-limit errors should not be treated as source-code failures.
6. Vercel deployment reaches `READY`; inspect provider deployment logs rather than blindly retrying a timed-out deployment.

A live build acceptance test creates a GitHub repository and Vercel deployment. Only run it with a disposable staging project after reviewing the generated source and confirming the credentials are staging-scoped. Do not automatically retry a request if a repository/deployment may already have been created; use the returned `requestId`/`jobId` and idempotency key to reconcile first.

## 3. Background workflow timeout handling

The workflow worker now has a 42-second soft execution budget within its 60-second route limit, a 90-second job lease, per-agent duration/failure telemetry, and a safe yield path that persists completed outputs and requeues remaining steps before the serverless hard timeout. A later worker resumes from the stored step results.

Inspect recent queue/run state without modifying it:

```bash
npm run diagnose:workflows
```

Required staging checks:

- `WORKFLOW_WORKER_ENABLED=true`; configure a secret of at least 32 characters and set the same secret in the trusted scheduler's Authorization bearer header.
- Confirm the `enqueue_due_workflows` and `claim_workflow_jobs` RPCs exist and service-role grants work.
- Trigger a workflow with multiple dependent steps, a read-only parallel batch, an approval-required step, and a deliberately slow agent. Confirm that a yielded run is queued, completed step outputs remain present, and the next worker continues without duplicating completed steps.
- Confirm cancelled runs are not requeued and failed attempts eventually enter `dead_letter` according to the queue retry policy.
- Check Vercel function duration and Supabase query logs together. Do not increase `maxDuration` without confirming the deployed Vercel plan/runtime supports it.

## 4. LeoCode runtime verification

```bash
npm run verify:leocode
```

To compile and run the extension's source tests after the nested extension dependencies are installed:

```bash
LEOCODE_RUN_COMPILE=true LEOCODE_RUN_TESTS=true npm run verify:leocode
```

Then perform interactive VS Code acceptance:

1. Open the `extensions/leocode` folder in VS Code and launch an Extension Development Host.
2. Confirm activation, LeoCode activity-bar view, chat agent manifest contribution, commands, and SecretStorage login survive a VS Code restart.
3. Start the AHP host; verify it binds only to loopback, has a fresh connection token, and stops cleanly.
4. Connect and run a harmless Gemini request; verify the server-side model selection and usage accounting.
5. Test read-only workspace inspection, an explicitly approved file edit, and an explicitly approved terminal action in a disposable workspace.
6. Confirm rejected approvals do not execute, secrets are not written to workspace files/logs, and sign-out clears the local LeonardX token.
7. Verify MCP calls require existing server-side grants and explicit user confirmation.
8. Package and install a VSIX only after compile/tests pass. The current AHP host remains an experimental Chat-view/extension integration; it is **not** proof of registration in VS Code's dedicated Agents-window harness. Shell approval is not an OS sandbox.

## 5. LeonardX Work GitHub Actions runtime verification

Create the private `LEOOS-RUNTIME` repository and copy its workflow from `LEOOS-RUNTIME/.github/workflows/workspace-runtime.yml`. Install the LeonardX GitHub App with Metadata: read and Actions: write. Configure `LEONARDX_BASE_URL` and `CRON_SECRET` as repository secrets and configure the matching server-side environment variables. Verify the repository is private, dispatch a harmless test workspace, confirm the run executes on a fresh GitHub-hosted runner, and confirm the job cannot access production secrets. Review logs for accidental project output disclosure. Do not enable Cloudflare until its replacement runtime is implemented and independently verified.

## 6. Remote Supabase / RLS verification

Run `supabase/verification/remote-rls-audit.sql` in the **staging** Supabase SQL Editor. It is read-only and reports public tables, RLS/force-RLS flags, policies, ownership columns, anon/authenticated SELECT grants, and storage bucket visibility.

Review every exposed table. RLS enabled is not sufficient by itself: inspect each policy's `USING` and `WITH CHECK` expressions for correct `auth.uid()`/tenant ownership, including `owner_user_id`, `user_id`, seller/buyer ownership, and related child rows. Verify private storage buckets and path-based object policies.

Then use two disposable authenticated users (A and B): create a row and storage object as A; prove B cannot select/update/delete the row or read/overwrite/delete the object; prove A can access their own resources; prove unauthenticated anon access is denied where intended. Repeat for `website_projects`, `project_builds`, `chats_v2`, `media_assets`, integrations, LeoCode workspaces/entitlements, workflow tables, and relevant Store tables. Do not use service-role credentials for these client-policy assertions because service role bypasses RLS. Do not run broad UPDATE/DELETE statements in SQL Editor.

## 7. Live Gemini image and voice tests

Set a staging key and a short test recording (WAV or WebM, <=5 MB), then explicitly enable the billable test:

```bash
LEONARDX_LIVE_TESTS=true \
GEMINI_API_KEY=... \
LEO_GEMINI_IMAGE_MODEL=gemini-2.5-flash-image \
LEO_GEMINI_AUDIO_MODEL=gemini-3.5-flash-lite \
LEONARDX_TEST_AUDIO_FILE=./qa-audio.wav \
npm run verify:gemini:live
```

The script calls Gemini directly and reports only whether an image part and transcript were returned; it does not print API keys or audio contents. It may incur provider charges. Follow with end-to-end authenticated staging UI tests for Leo Chat image upload/storage/vision and voice recording/transcription/response playback; direct API success alone does not verify the app routes or browser permissions.

## 8. Chat / Work and conversation UX acceptance

In the signed-in Leo workspace:

1. Confirm the Chat switch stays on `/app` and Work opens the existing `/engineering` workflow surface on desktop and mobile.
2. Start a conversation, send several messages, scroll upward, and confirm new output does not pull the reader away from the older message. Use “Jump to latest” and confirm it returns to the bottom.
3. Open a prior conversation while signed in on a second browser/device. Confirm account-backed messages are loaded first; if account sync is unavailable, the UI must explicitly identify a local cached copy.
4. Attach three supported images, replace one, remove another, and verify the old unsent uploads are deleted from the owner's private `chat-images/<user-id>/` storage path. Confirm a different account cannot view or delete them.
5. Send an image with a question and confirm the provider receives the image, the chat message persists with its private asset reference, and re-opening the conversation restores the preview.
6. Start a new chat while attachments are pending; confirm the previous session remains in history and unsent private image uploads are cleaned up.
7. Ask Leo to create a PDF/DOCX and confirm export actions appear only after a document-format request. Ask a normal question and confirm export actions are absent.
8. Repeat with keyboard-only navigation, reduced-motion preference, 390 px mobile viewport, and Android safe-area insets.

## 9. Responsive browser verification

Install the repository's Python Playwright requirements and Chromium, start the local app with staging-safe environment variables, then run:

```bash
python3 scripts/visual-qa-playwright.py --base-url http://127.0.0.1:3000
```

The report captures desktop (1440), tablet (834), and mobile (390) at light and dark themes, with per-viewport horizontal overflow counts, route status, console errors, and page errors. Review `artifacts/visual-qa/summary.json`, `route-results.csv`, and screenshots. The default run is unauthenticated; it records auth redirects rather than claiming protected pages passed. Add authorized staging browser coverage for chat, project builder, dashboard, LeoCode workspace, voice, image attachments, and Store flows before release.

## Release gate

Release only after dependency installation, TypeScript, lint, full tests, production build, migration dry-run, staging RLS isolation, worker resume/cancel behavior, live Gemini image+audio, LeoCode interactive runtime, sandbox host isolation, and responsive browser review all pass. Keep a written record of the staging URL, commit SHA, migration version, request IDs, test-account IDs (not passwords/tokens), and artifact URLs. No production deployment is performed by this runbook.
