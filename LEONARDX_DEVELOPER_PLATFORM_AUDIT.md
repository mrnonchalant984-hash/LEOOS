# LEO OS Developer Platform and Pricing Audit

**Reviewed:** 2026-10-10  
**Scope:** Current working tree for the developer platform, API, packages, webhooks, plugins, pricing, and Paystack flow.

This review preserves the pre-existing uncommitted worktree changes. No production deployment, database migration, payment, npm publish, or push to `main` was performed.

## Feature status

| Area | Status | Evidence and limits |
|---|---|---|
| Web IDE | **PARTIAL** | [`components/ide/WebIde.tsx`](./components/ide/WebIde.tsx) loads, edits, and saves workspace files through [`app/api/workspaces/[id]/files/route.ts`](./app/api/workspaces/%5Bid%5D/files/route.ts), which checks the signed-in owner and bounds paths/payloads. The console only supports `help`, `ls`, `cat`, and `clear`; it does not execute code, run a shell, or deploy. Live Supabase persistence was not exercised. |
| CLI | **PARTIAL** | [`packages/cli/src/index.mjs`](./packages/cli/src/index.mjs) has real API-key validation and project list/create/status operations; its help command ran successfully. `leo deploy` and `leo ship` intentionally refuse because API-key task dispatch/deployment endpoints are not implemented. `status` returns a snapshot, not a telemetry stream. Credentials are stored in a local config file; OS keychain integration and Windows ACL enforcement were not verified. |
| Public REST API | **PARTIAL** | The documented API-key endpoints are under `/api/v1` and are backed by route handlers. API-key scope/rate-limit behavior and SDK request construction have unit coverage, but no live authenticated database/API request was run. Existing `/api/v2` routes were retained for compatibility; unrelated application APIs remain unversioned. |
| OpenAPI | **PARTIAL** | [`lib/openapi-v1.ts`](./lib/openapi-v1.ts) declares OpenAPI `3.1.0`, API `info.version: 1.0.0`, and `/api/v1` routes; [`tests/openapi-v1.test.mjs`](./tests/openapi-v1.test.mjs) checks that documented routes exist. The document does not describe the separate legacy `/api/v2/webhooks` contract. |
| TypeScript SDK | **PARTIAL** | [`packages/sdk/src/index.ts`](./packages/sdk/src/index.ts) uses real v1 endpoint paths and typed responses/errors. SDK TypeScript build, tests, and `npm pack --dry-run` passed. It is not published, no live API request was made, and the package tarball currently omits the root license file; resolve package licensing metadata before publishing. |
| Webhooks | **PARTIAL** | There are two existing systems: API-key CRUD under `/api/v2/webhooks` backed by `webhooks`, and session-based developer endpoints/worker backed by `webhook_endpoints` plus `webhook_deliveries`. The worker signs payloads and has bounded retries; only `webhook.test` is currently emitted by the worker. The API-key test route emits `leo.test` separately. These systems were not consolidated to avoid breaking existing endpoint data. The legacy endpoint schema stores `secret` directly, unlike the API-key webhook schema's encrypted/hash fields. |
| Plugin registry | **PARTIAL / MIGRATION REQUIRED** | [`lib/plugins.ts`](./lib/plugins.ts) uses persistent metadata storage; [`lib/plugins-core.ts`](./lib/plugins-core.ts) validates manifest versions, allowlisted permissions, and public HTTPS entrypoints. Registration/lifecycle operations require platform-owner 2FA. Runtime execution is disabled. The additive [`plugin_manifests` migration](./supabase/migrations/20261010140000_plugin_manifests.sql) exists in this worktree but was not applied or checked against production. |
| Pricing and subscription billing | **IMPLEMENTED IN CODE; PRODUCTION PRICE CHANGE NOT APPROVED/VERIFIED** | [`lib/pricing.ts`](./lib/pricing.ts) centralizes NGN prices, integer interval totals, and public Business → legacy internal `unlimited` mapping. [`app/api/payment/initialize/route.ts`](./app/api/payment/initialize/route.ts) computes the amount server-side; the client cannot submit a price. No subscription rows were rewritten. |
| Free website tier and hosting | **PARTIAL** | [`lib/pricing.ts`](./lib/pricing.ts) keeps Free at ₦0 with one website project/build per month; build authorization uses the plan limits and eligible deployments start a separate 90-day hosting trial. Hosting renewal remains a separate service. The live deployment/trial flow was not tested. |
| API usage/audit logging | **PARTIAL / MIGRATION REQUIRED** | API-key requests use [`lib/api-auth.ts`](./lib/api-auth.ts) for authentication, scope checks, distributed PostgreSQL limits, and safe request-outcome logging. The additive [`api_request_logs` migration](./supabase/migrations/20261010150000_api_request_logs.sql) is present in the worktree but was not applied or verified remotely. |

### Versioning

The public SDK and the OpenAPI document target `/api/v1`; the OpenAPI document's `1.0.0` is its contract version, and plugin `apiVersion: "1"` is a separate field. Existing `/api/v2` webhook endpoints were not newly introduced or removed. Keep them only as a documented compatibility contract until clients and stored endpoint data can be safely migrated.

## Pricing configuration

The code uses integer NGN naira values and derives undiscounted period totals from `1`, `3`, and `12` months. Paystack amounts are converted to integer kobo by multiplying by `100`.

| Plan | Monthly | Quarterly total | Yearly total |
|---|---:|---:|---:|
| Free | ₦0 | ₦0 | ₦0 |
| Standard | ₦12,500 | ₦37,500 | ₦150,000 |
| Pro | ₦31,500 | ₦94,500 | ₦378,000 |
| Business | ₦63,000 | ₦189,000 | ₦756,000 |

No interval discount is applied. The pricing page labels quarterly/yearly amounts as period totals and says plans are prepaid and do not automatically renew. Business keeps the existing `unlimited` subscription ID; display helpers render it as Business, so no customer record migration is required for this name change.

The ignored local `.env` contains legacy price configuration that differs from the proposal: Standard monthly is unset, while its quarterly/yearly values are ₦13,500/₦48,000; Pro is ₦15,000/₦40,000/₦120,000; Unlimited is ₦30,000/₦80,000/₦240,000. These are local values only. The Vercel Production environment contains all nine legacy variable names, but the CLI did not expose their numeric values; they were not downloaded or printed. The new server configuration no longer reads those legacy variables. Therefore deploying this code changes checkout pricing to the proposed amounts. Compare the actual Vercel values and explicitly approve that change before deployment.

No Lovable price comparison or “5% cheaper” claim was added. The Nigerian rates are not an exact same-currency, same-feature comparison.

## Paystack verification

- Checkout requires an authenticated account and a server-generated reference; the server computes and records the amount and sends Paystack an amount in kobo.
- Payment verification checks Paystack's success state, reference, registered amount, currency, owner, plan, and billing period before invoking the existing idempotent database function.
- The Paystack webhook validates its HMAC signature before parsing/processing events. Repeated successful payment references are handled by the subscription application function.
- Current intervals are prepaid periods, not Paystack auto-renewing subscriptions. The pricing UI discloses this.
- Paystack's live/test transaction flow was not exercised. No charge or provider-side transaction was created.

## Webhook operational limits

The worker's retry delays are 1 minute, 5 minutes, 30 minutes, 2 hours, and 6 hours. [`vercel.json`](./vercel.json) currently schedules `/api/cron/webhooks` once daily, so those retry intervals are not delivered at their advertised cadence in the deployed schedule. Retry timing requires a suitably frequent supported scheduler; do not silently switch a Hobby deployment to a schedule its plan rejects.

This review added a five-minute claim lease so a delivery left claimed by a timed-out worker can later be reclaimed. Unit coverage verifies the lease cutoff, but concurrent claims and recovery were not tested against a live database.

## Verification actually completed

- `npm run typecheck` — **passed**.
- `npm run lint` — **passed**, 0 errors and 11 warnings in other existing files.
- `npm test` — **passed**, 49 tests, 0 failures.
- `npm --prefix packages/sdk run build` — **passed**.
- `node packages/cli/src/index.mjs --help` — **passed**.
- `npm pack --dry-run --json --ignore-scripts` in both package directories — **passed**; no package was published. The SDK dry run shows that its package-local LICENSE is missing.
- `npm run build` — **not completed**. Next.js compiled successfully, then the build was stopped when its process used about 7.4 GB and the 12 GB machine had about 100 MB free. Post-compile/static build completion is unverified. The existing Sentry source-map upload hook was eligible during this build; whether upload completed before interruption is unknown.
- No live Supabase migration, API-key login, Paystack payment, webhook delivery, plugin registration, or deployed browser flow was run.

## Pending work before production rollout

1. Compare the hidden Vercel Production price values against the proposed totals and approve the customer-facing price change. The application has not been deployed.
2. Decide whether the daily webhook worker is acceptable; otherwise provision a supported more frequent scheduler and reconcile the two webhook storage systems, including encrypted handling of legacy endpoint secrets.
3. Apply the plugin registry and API request-log migrations only through the authorized migration process; neither migration has been pushed here.
4. Confirm package copyright/license metadata, include a package-local license, and verify npm scope ownership before publishing.
5. Run the complete production build on a machine with adequate free memory, then perform authorized live checks for database persistence, API-key authentication, webhook delivery, and Paystack test-mode verification.
