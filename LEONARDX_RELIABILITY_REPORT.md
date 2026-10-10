# LEO OS — Reliability and Developer Guide Report

Date: 2026-10-10  
Product: LeonardX / LEO OS  
Branch used: `codex/leonardx-readiness-20261010`  
Monitoring implementation pushed to `origin/main` in `7c64cb1`; this report and the updated Integration Studio report are included in the follow-up documentation commit. No force push or deployment.

## Findings and root causes

- The app had Vercel Web Analytics only. It had no error-monitoring SDK, no Speed Insights package, and no application liveness endpoint.
- API-key endpoints already record usage, request IDs, status codes, and latency. Other operational flows had ad-hoc `console.error`; Leo Chat returned raw exception messages, agent runs persisted raw failure text, build/deploy responses and build logs could include provider exception text, and Paystack webhook error logs included a payment reference and raw exception message.
- The owner dashboard API is already protected by owner authorization plus 2FA/trusted-device checks. It has no monitoring provider integration. Provider metrics cannot be displayed honestly without external Sentry/Vercel project credentials and backend access, so a live owner monitoring panel is deferred.
- The existing `/status` screen reported environment configuration only, not actual provider health. The new health endpoint intentionally measures process liveness only.
- The existing Web IDE is authenticated and project-owner scoped, with file validation and an intentionally non-executing console. The dashboard’s project list linked to `/templates` instead of the real workspace IDE.
- The existing CLI’s cloud dispatch/deployment commands explicitly do not run. The plugin registry is owner-registered metadata in a process-local Map and never executes plugin code.

## Changes made

- Installed `@sentry/nextjs` 11.6.0 and `@vercel/speed-insights` 2.0.0.
- Added Sentry browser, Node, Edge, Next instrumentation/error-boundary, and build configuration using the installed SDK’s current API. Sentry initializes only when its DSN is configured. Production traces default to 5% sampling; source maps are not generated/uploaded by the Sentry plugin unless the auth token, organization, and project are all configured. The SDK is not claimed active until a real DSN is installed and a test event is observed.
- Added a strict event scrubber: user objects, request headers/cookies/bodies/query strings, error text, local variables, source context, arbitrary breadcrumbs, and unknown span attributes are dropped. Only parameterized route/correlation identifiers and allowlisted technical metadata remain. Session replay is not enabled. Provider inputs/outputs, SQL data, cookies, headers, and local variables are explicitly disabled in Sentry’s `dataCollection` options.
- Added a same-origin `/_monitoring` Sentry tunnel when both DSNs are configured, excluded from auth refresh middleware. This keeps browser intake on the application origin; no Sentry DSN is currently configured in the inspected environment.
- Added a structured operational wrapper with correlation ID, operation, provider category, outcome, status, and duration for Leo AI, agent execution, project build/deploy, Paystack verification, and Paystack webhook handling. It does not log prompts, full conversation content, file contents, payment references, provider exception text, or secrets. Sentry capture is deduplicated per operation and expected payment rejections are classified as rejected, not critical exceptions.
- Removed raw exception response/log detail from the instrumented Leo Chat, build/deploy, agent-run, payment-verify, and Paystack webhook failure paths; payment verification remains server-side and existing signature/transaction/business rules are preserved.
- Added `/api/health`, a no-store liveness response with a random request ID. It performs no Supabase, AI, payment, or other external request. `/status` now distinguishes liveness from configuration presence and provides a real “Check now” interaction.
- Added Vercel Speed Insights at 25% sample rate. Existing Web Analytics and Speed Insights both strip query data and normalize project/workspace IDs in page URLs before submission. The Vercel dashboard must enable Speed Insights and receive a deployment/traffic before data appears.
- Updated the privacy policy to disclose operational monitoring and performance measurement, the telemetry categories and redaction behavior, and links to provider privacy material.
- Added `/cli`, `/ide`, and `/plugins` guide pages, global navigation entries, and source-backed simulated walkthrough examples. Simulations send no request and claim no success. The real IDE is linked from each project row in the authenticated dashboard. Its safe console remains non-executing.
- Preserved the existing plugin API/registry behavior and clearly explained its in-memory, metadata-only limitations.
- Added tests for liveness privacy, sample-rate parsing, UUID correlation IDs, Sentry event redaction, Speed Insights/Analytics URL filtering, walkthrough contracts, and safe preview boundaries.

## Verification actually completed

- `npm run verify` — passed on the final merged source tree (typecheck, lint, tests, production build).
- `npm run typecheck` — passed after the final Sentry API adjustment.
- `npm run lint` — passed with 0 errors and 12 existing warnings in unrelated files.
- `npm test` — 42 passed, 0 failed.
- `npm run build` — passed on the merged tree; Next.js generated 150 route entries, including `/api/health`, `/cli`, `/ide`, and `/plugins`.
- Production-browser checks: `/cli`, `/ide`, `/plugins`, and `/status` rendered; `/api/health` returned `{"status":"ok"}`. The status page’s Check now button displayed “Responding” with a request ID. Studio mode controls rendered; scenario data for all six modes passed automated contract/highlight tests.
- Local production browser also showed existing Vercel Analytics/Speed Insights script 404s because the local non-Vercel deployment has no Vercel intake route, and existing report-only Google Ads frame CSP messages. These do not represent production telemetry verification. The scripts become available after enabling the features and deploying through the linked Vercel project.
- During implementation, typecheck caught an unsupported Sentry option and a first production build exposed a Next Server-to-Client function-prop error in the analytics setup. Both were fixed; tracking functions were moved behind `app/observability-scripts.tsx`; final `npm run verify` passed.
- `git diff --check` passed before the reliability report was added. No database migration or data change was made.

## Provider setup and manual work remaining

### Sentry

Create a Sentry Next.js project and configure server-side deployment secrets:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN` (public ingestion DSN, not an auth token)
- `SENTRY_AUTH_TOKEN` (optional build-only secret for source-map upload)
- `SENTRY_ORG` and `SENTRY_PROJECT` (required with the token for this build integration)
- Optional `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE`, and trace sample rate variables documented in `.env.example`.

After configuration, redeploy, trigger one controlled exception in a non-production environment, and verify that it appears in Sentry with the expected release and safe route/correlation tags. This was not possible here: no Sentry DSN or auth token was present, so delivery and source-map symbolication are unverified.

### Vercel Speed Insights

Enable Speed Insights on the existing Vercel project, deploy, and check the Speed Insights dashboard after real traffic arrives. This work only installs and privacy-filters the package; it does not claim data collection has begun. Lighthouse/PageSpeed remains a separate synthetic test workflow.

### Alerts

No provider credentials were available to create or verify alerts. Configure these manually in provider dashboards:

1. External uptime check for `GET /api/health`, alert on failed requests or sustained non-200 responses. This is process liveness, not dependency readiness.
2. Sentry production issue alerts for new issues and elevated error counts; filter/group on `operation`, `provider`, `environment`, and release tags.
3. Sentry alerts for repeated unexpected `openai` errors on `leo.ai.request`/`agent.run`, and unexpected `paystack` exceptions on payment operations. Expected declined/mismatched payment references are not sent as critical Sentry exceptions; use operational logs and Paystack reconciliation for those outcomes.
4. Review LCP, INP, and CLS regressions in Vercel Speed Insights after enabling it. Confirm the account plan’s alerting/observability capabilities before promising automatic thresholds.
5. Configure Vercel log alerts or an approved log drain for structured `leo.operation` records if the account plan supports the required filters and alerts. No drain was created.

The owner dashboard integration remains a separate phase. A secure implementation needs Sentry/Vercel read credentials, server-side provider API routes, 2FA-protected authorization, rate limits/caching, and careful aggregation. No monitoring token is exposed in the browser.

## Remaining risks and verification limits

- Sentry event delivery, sampled traces in production, and source-map upload are unverified until provider credentials are configured.
- Speed Insights real-user samples and dashboard availability are unverified until Vercel enables the feature and deploys the app.
- Provider alert rules, provider outages, external uptime checks, and the owner monitoring dashboard are not active/verified.
- No authenticated Supabase/Leo/project/deployment/Paystack transaction was run during this change. Existing unit tests cover payment matching and webhooks; real credentials were not used.
- The local browser emitted Vercel intake 404s and report-only AdSense frame-policy messages as described above.
- No production database migration, deploy, package publication, or production-payment test was run.

## Primary references

- [Next.js instrumentation guide](https://nextjs.org/docs/app/guides/instrumentation)
- [Sentry Next.js setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
- [Vercel Speed Insights quickstart](https://vercel.com/docs/speed-insights/quickstart)
- [Speed Insights privacy and compliance](https://vercel.com/docs/speed-insights/privacy-policy)
- [Speed Insights limits and pricing](https://vercel.com/docs/speed-insights/limits-and-pricing)
