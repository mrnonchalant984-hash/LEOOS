# LeonardX UX Upgrade and Production Readiness Review

## Decision: NO-GO for production

The current public GitHub `main` head inspected on 2026-10-13 was `996d06fd9d81811533d3cf6d4311fbbe8f9b6ca8`. The repository write integration rejected branch creation with HTTP 403 (`Resource not accessible by integration`), so the changes are packaged for review but were not pushed, committed, or deployed.

## UX changes in this package

- Simplified the signed-in workspace sidebar by removing public marketing pages from the primary product navigation. Public destinations remain available in the keyboard command palette.
- Added a dedicated `API plans` destination in the Developer platform group.
- Fixed nested navigation active-state selection so a specific route such as `/developers/pricing` does not also highlight its parent route.
- Added `/developers/pricing`, clearly separating Developer API access and future API billing from Leo AI/project subscriptions and website hosting. Paid API prices and quotas are explicitly marked pending rather than invented.
- Added a cross-link on `/pricing` to the separate Developer API pricing page.
- Added source-level regression tests for sidebar separation, nested route highlighting, and pricing separation.

## Production-readiness review — source-level only

Repository baseline inspected: public GitHub `main` at `996d06fd9d81811533d3cf6d4311fbbe8f9b6ca8` (2026-10-13). The focused overlay was applied and tested against a clean worktree whose relevant baseline file blobs match the inspected remote files. The full suite was run separately on the supplied working snapshot, which contains earlier local changes and intentional CLI/SDK deletions; it is not evidence that every test in the remote `main` checkout fails.

| Severity | Area / exact evidence | Finding and required action |
|---|---|---|
| **Critical / release blocker** | Image persistence and credit handling: `app/api/generate-image/route.ts`; `app/api/generate-visual/route.ts`; `lib/access.ts` | Image generation consumes a credit before provider completion. The image route expects `data[0].url` only and returns a provider URL directly; it does not persist the output in private storage. A provider response with `b64_json` but no URL is treated as failure after charging. The visual route can return `b64_json` to the client and likewise has no persistent asset reference or explicit refund path. Implement durable private asset storage and atomic reserve/settle/refund before production use. |
| **High** | Agent entitlement routing: `lib/agents/manager.ts`; `app/api/agents/run/route.ts` | `classifyAgents()` immediately returns `[]` for every non-owner, so automatic customer agent routing is disabled. The route derives a plan and rate limits but does not visibly apply a plan-to-agent allowlist before manual `agent_id` execution; it only rejects `ownerOnly` agents. Add a trusted capability/plan check to every manual and automatic execution path, then test free, paid, owner, and organization cases. |
| **High** | API key enforcement consistency: `lib/api-auth.ts`; `lib/api-keys.ts`; `lib/api-keys-core.ts` | Two separate API-key authenticators use different revocation fields (`revoked` vs `revoked_at`), storage/logging tables (`api_request_logs` vs `api_usage`), and fixed rate limits (120/min vs 60/min). Route-by-route use can produce inconsistent security and metering behavior. Consolidate onto one server-side authenticator and add endpoint coverage for expiry, revocation, scopes, and tenant ownership. |
| **High** | SSRF / endpoint URL validation: `lib/public-site-url.ts`; `lib/webhooks-core.ts`; `lib/api-security.ts` | Public-site URL validation rejects literal IPs and local-looking hostnames but does not itself resolve DNS and verify the resolved address. `isSafeWebhookUrl()` has a narrower private-address filter than `lib/webhooks-core.ts`. DNS rebinding, redirects, IPv6 edge cases, and resolution-to-connection binding were not verified. Treat SSRF as unproven until outbound fetches pin/validate all resolved addresses and each redirect. |
| **High** | Payment processing and idempotency: `app/api/payment/initialize/route.ts`; `app/api/payment/verify/route.ts`; `app/api/payment/webhook/route.ts`; `lib/payments.ts` | Good controls are present in source: server-computed amounts, pending payment records, Paystack transaction verification, amount/currency/reference checks, HMAC-SHA512 webhook signature validation, timing-safe comparison, and provider-event deduplication logic. However, no staging replay/concurrency test was run. The webhook includes compatibility handling for an optional `provider_event_id` column, so deployed migration state must be verified before relying on deduplication. No release pass can be inferred from source alone. |
| **High** | Subscription lifecycle / refunds: `lib/payments.ts`; `lib/pricing.ts`; `app/api/payment/webhook/route.ts`; `app/pricing/page.tsx` | The pricing UI states that periods are prepaid and do not auto-renew. Renewal, cancellation, expiry, chargeback/refund and entitlement transition behavior were not validated end-to-end against Paystack test mode. Publish no auto-renew or refund claim beyond the current code/policy and verify every transition in staging. |
| **High** | Durable agent jobs: `app/api/agents/run/route.ts`; `supabase/migrations/` | The async route fails closed when `AGENT_WORKER_ENABLED` is not `true`, and otherwise creates `agent_runs` plus `agent_jobs`. Worker retry, lease recovery, cancellation, duplicate submission, and result isolation were not exercised against a database/worker. Do not market durable execution as operational until these are tested. |
| **High** | Authentication and tenant isolation: `lib/auth.ts`; `app/api/chat/route.ts`; `app/api/agents/run/route.ts`; `lib/organization-access.ts` | The source uses Supabase `getUser`, owner identity checks, user-filtered chat queries, and organization-role checks in agent runs. These are positive controls, but RLS policies, service-role query paths, and cross-user/cross-organization isolation require a staging two-account test. `proxy.ts` refreshes auth cookies; it is not a substitute for per-route authorization. |
| **Medium / release blocker** | CSP: `next.config.js` | `Content-Security-Policy-Report-Only` is deliberately report-only, not an enforced CSP. Keep this a documented release gate: review violation telemetry, tune policy, and enable enforcement after staging browser tests. Other security headers are configured in source but were not checked on deployed responses. |
| **Medium** | Webhooks: `lib/webhooks-core.ts`; `app/api/payment/webhook/route.ts`; `app/api/webhooks/` | `WEBHOOK_EVENTS` currently includes only `webhook.test`, which is honest but means application business-event delivery is not a general-purpose event system. Payment webhook event ingestion is separate. Verify event-to-delivery mapping and retries before claiming broader event support. |
| **Medium** | Monitoring / sanitized logs: `app/api/research/route.ts`; `lib/monitoring.ts`; `lib/api-auth.ts` | Monitoring wrappers and generic API error responses exist. Research logs provider error messages via `console.error`; no deployed log sink/redaction or alert-delivery test was available. Review provider error redaction and validate alerting in staging. |
| **Medium** | Backup and recovery | Documentation exists, but no backup configuration, restore drill, or recovery-time evidence was available from this source-only session. Treat backup/recovery as unverified until an isolated restore exercise is recorded. |
| **Medium** | Dependency and build integrity: `package.json`; `package-lock.json` | Dependency installation in the supplied workspace is incomplete (`next` and `zod` are missing from `node_modules`). No dependency audit or production build could be certified in this environment. Run lockfile-based install, dependency audit, and build in CI. |

No destructive database operation, production mutation, live charge, or deployment was performed. Source presence is not evidence that provider credentials are configured or integrations are operational.

## Test results

- Added tests: `tests/workspace-navigation.test.mjs`.
- Focused test command: `node --test tests/workspace-navigation.test.mjs` — 3 passed, 0 failed, after applying the overlay to a clean worktree. `git diff --check` also passed.
- Full test command: `npm test` — 50 passed, 3 failed. The failures are `tests/cli-orchestration.test.mjs` and `tests/sdk.test.mjs` because the user snapshot intentionally removed the CLI/SDK source files, and `tests/plugins.test.mjs` because `node_modules/zod/index.js` is missing from the incomplete install.
- Full `npm run verify`: failed at `npm run typecheck` with `next: not found` (exit code 127); lint and build were not reached.
- External integration tests: not run; no Supabase/Paystack/OpenAI/Runway/Vercel staging credentials were used.
- No database migration was applied, no production data was touched, and no deployment was triggered.

## Safe staging checklist

1. Apply this overlay on a clean branch based on the latest `main`; review the diff and preserve any unrelated edits.
2. Install exact lockfile dependencies; run `npm run verify` and fix all failures.
3. Deploy to an isolated Vercel preview with staging-only Supabase and provider keys.
4. Verify anonymous, free, paid, owner, and separate-organization access boundaries with distinct accounts.
5. Exercise API key scope/expiry/revocation, request validation, rate limits, SSRF protections, prompt-injection boundaries, and sanitized errors.
6. In Paystack test mode, verify signature checking, duplicate webhook handling, transaction verification, expiry/cancellation and refund policy.
7. Inject OpenAI/Runway failures and storage failures; confirm credits settle/refund once under concurrent requests.
8. Test durable agent retry/cancel and confirmation-required actions, plus webhook event-to-delivery mapping.
9. Verify RLS, security headers, CSP telemetry, monitoring alerts, backup restore and audit-log redaction.
10. Record evidence for every mandatory release gate before changing the decision from NO-GO.
