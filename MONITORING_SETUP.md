# LEO OS monitoring setup

The repository includes optional Sentry error monitoring, Vercel Speed Insights, safe operation logs, and `GET /api/health`. Provider data collection remains inactive until the external project settings and environment variables below are configured.

## Sentry

Create a Sentry project for the LeonardX Next.js app, then add environment-specific values to Vercel and local non-production environments:

| Variable | Where | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | Server runtime | Sentry ingestion endpoint for Node and Edge errors. |
| `NEXT_PUBLIC_SENTRY_DSN` | Build/client | Browser Sentry ingestion endpoint. A DSN is public configuration, not an auth token. |
| `SENTRY_TRACES_SAMPLE_RATE` | Server runtime | Trace sample fraction from 0 to 1; default is 0.05. |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Build/client | Browser trace sample fraction from 0 to 1; default is 0.05. |
| `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Runtime/build | Optional `production`, `preview`, or another Sentry environment label. |
| `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE` | Runtime/build | Optional release value; the server falls back to Vercel’s commit SHA. |
| `SENTRY_AUTH_TOKEN` | Build secret only | Optional source-map upload token with minimum required Sentry project-release and organization-read scopes. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build configuration | Required with the token for source-map upload. |

The build integration does not generate/upload Sentry source maps unless the auth token, organization, and project are all set. When source maps are enabled, the Sentry plugin deletes uploaded maps. Do not expose the auth token through `NEXT_PUBLIC_*` variables or commit it.

Sentry is initialized only when the relevant DSN is present. Without it, capture calls are no-ops. Collection explicitly disables user info, cookies, headers, bodies, URL query values, GraphQL documents/variables, generative AI inputs/outputs, database payloads, queue arguments, stack locals, and source-context lines. A final event scrubber retains only exception type/stack, release/environment, parameterized route, random correlation ID, and allowlisted technical fields. Session Replay is not installed/enabled.

After setting values, deploy to a non-production environment, trigger a controlled exception, and verify it in the correct Sentry project. Confirm event tags include the sanitized operation/provider/request ID and that the stack is symbolicated. This verification still requires a Sentry account and credentials.

## Vercel Speed Insights

1. Open the existing LeonardX Vercel project and enable **Speed Insights** in its dashboard.
2. Deploy the current source to Vercel. The code mounts the official Next.js `<SpeedInsights>` component at 25% sampling and removes query strings and project/workspace IDs from page URL fields before collection.
3. Visit the deployed site and review the Speed Insights dashboard after it has received traffic. Look at LCP, INP, and CLS separately from Lighthouse/PageSpeed synthetic scores.

The script/data routes are Vercel-generated. Local `next start` does not serve them, so their 404s locally do not verify or disprove production intake. Verify script and vital requests on the deployed Vercel domain and inspect the dashboard. Check current Vercel plan limits and usage before increasing the sample rate.

## Liveness endpoint

Use `GET https://<deployment>/api/health` for a lightweight synthetic uptime check. It makes no dependency calls and returns only `{ "status": "ok" }`, `Cache-Control: no-store`, and an `X-Request-ID`.

Recommended external check: every 1–5 minutes; alert on connection failure or a sustained non-200 response. This route proves only that the Next process answered—it does not prove that Supabase, Leo/OpenAI, Paystack, GitHub, or Vercel APIs are healthy.

## Operational logs and alerts

The app emits JSON operation records for `leo.ai.request`, `agent.run`, `project.build_deploy`, `payment.verify`, and `payment.webhook`. Records contain operation/provider, sanitized request ID, outcome, HTTP status, and duration; they exclude prompts, files, conversation text, transaction references, and provider error strings. API-key routes retain their existing database request/latency logs.

Create and test these rules in provider dashboards; none is active merely because the code is installed:

1. **Downtime:** monitor `/api/health`; alert on consecutive failed checks.
2. **Application errors:** Sentry production issue alert for new issues and a sustained event-count threshold. Group/filter by release, `operation`, and `provider`.
3. **Leo/agent failures:** Sentry error-count alert filtered to `provider:openai` and the `leo.ai.request` or `agent.run` operation tags. Tune for repeated failures/timeouts rather than individual user mistakes.
4. **Payment verification:** alert on unexpected Sentry errors tagged `provider:paystack`. Expected non-success transactions and reference/amount mismatches are rejected and logged as non-critical outcomes, not sent as exception incidents. Use Vercel operational logs/Paystack reconciliation for volumes of expected rejects; configure an approved log drain if the account plan requires one.
5. **Performance:** use the Vercel Speed Insights dashboard to review production LCP/INP/CLS and compare releases. Confirm the available threshold-alert options for the Vercel plan before representing them as active.

Do not page on every 4xx request. The application intentionally treats validation, permission denials, provider-declined payments, and expected webhook retries differently from unexpected exceptions.

## Owner dashboard phase (not implemented)

The owner dashboard API is protected by platform-owner authorization and 2FA/trusted-device checks. It does not yet fetch monitoring-provider metrics. A follow-up implementation requires Sentry/Vercel server-only read credentials, a backend API route that re-checks owner and 2FA authorization, rate limiting/caching, aggregation by release/operation, and redacted error summaries. No provider token is available in the current environment, so the dashboard is deliberately not populated with invented health or performance values.
