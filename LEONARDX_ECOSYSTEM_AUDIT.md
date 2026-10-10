# LeonardX ecosystem audit

Audit date: 2026-10-10

Product: LeonardX / LEO OS

Founder identity: Leonard Udoh — Developer and Team Owner
Assistant: Leo

## Scope and method

Inspected the current worktree, package scripts and installed Next.js version (16.3.6), route files, API handlers, relevant Supabase schema/migrations, API-key and payment code, SDK/CLI, templates, organizations, plugins, agents, analytics, docs/playground, and Vercel configuration. This audit distinguishes a route or schema object from an end-to-end verified capability.

The worktree already contained uncommitted changes before this audit, including the IDE/workspace routes, CLI coordination helpers, SDK orchestration contracts, and related tests. Those were treated as existing work and preserved. The untracked `public/leonardx-logo.svg` was also preserved and excluded from this audit’s scope.

## Executive summary

- No source implementation changes were made during the read-only audit phase; this file records findings before repairs.
- Current test baseline: `npm test` passed 28/28 tests.
- Current lint baseline: `npm run lint` failed with 18 errors and 20 warnings, primarily existing React effect-state and navigation lint findings in application pages/components.
- Typecheck and production build were started for baseline verification; final completion status will be recorded in the production-readiness report.
- `supabase migration list` confirmed that the five checked-in migrations are already applied to the linked database. No migration was pending at audit time.
- Read-only remote schema inspection confirmed both webhook generations coexist. The single `webhook_deliveries` table has fields for both models, increasing the risk of incompatible delivery processing.
- Important risks: webhook event delivery is not wired consistently; an unsigned-by-API-key website-audit endpoint can fetch arbitrary URLs; hosting-renewal Paystack webhook handling does not call the transaction verification helper; API request logging is not connected to the v2 handlers; organization roles do not consistently authorize project access; and agent execution has no durable worker.

## Feature status matrix

Status values follow the requested categories: **IMPLEMENTED AND VERIFIED**, **PARTIALLY IMPLEMENTED**, **PRESENT BUT UNVERIFIED**, **MISSING**, or **BLOCKED BY EXTERNAL CONFIGURATION**.

| # | Capability | Status | Evidence and limits |
|---|---|---|---|
| 1 | Developer API and keys | **PARTIALLY IMPLEMENTED** | [API-key route](./app/api/developers/api-keys/route.ts), [API auth](./lib/api-auth.ts), [key core](./lib/api-keys-core.ts), and [API-key migration](./supabase/migrations/20261008_api_keys.sql). Cryptographic random keys are SHA-256 hashed; one-time secret display, scopes, expiry, revocation and server-side key ownership checks exist. The active v2 auth uses `revoked`; the older unused [legacy helper](./lib/api-keys.ts) expects `revoked_at` and uses a separate non-atomic limiter. `recordApiRequest` has no call sites, so actual response/status/latency logs are not consistently recorded. Scope, abuse, revocation-race, and production integration coverage is incomplete. |
| 2 | JavaScript/TypeScript SDK | **PARTIALLY IMPLEMENTED** | [SDK source](./packages/sdk/src/index.ts), [SDK package](./packages/sdk/package.json), and [SDK tests](./tests/sdk.test.mjs). Project list/create/status, typed errors, bearer auth, retry-after parsing, and webhook signature verification are present. The package is not published, endpoint coverage is narrow, and no automated release/provenance workflow is configured. Local package build was verified in the preceding implementation work; publication is intentionally not performed. |
| 3 | Webhooks | **PARTIALLY IMPLEMENTED** | [API v2 management](./app/api/v2/webhooks/route.ts), [worker](./app/api/internal/webhooks/worker/route.ts), [developer endpoint flow](./app/api/developers/webhooks/route.ts), [legacy delivery service](./lib/webhooks.ts), and [webhook migrations](./supabase/migrations/20261008121000_webhooks.sql). HMAC, timestamp checks, HTTPS validation, delivery rows, timeouts, retry metadata, protected cron secret, and owner-scoped controls exist in portions. The public event catalog for the legacy path contains only `webhook.test`; the v2 event insert/dispatch pipeline is not wired. The worker selects the newest event by type rather than an event ID linked to each queued delivery, risking wrong payloads. Legacy endpoint secrets are plaintext in `webhook_endpoints`; the v2 `webhooks` model encrypts secrets. Current remote database has both schemas on `webhook_deliveries`. Retries use a daily Vercel cron schedule, unsuitable for minute-scale backoff. |
| 4 | Rate limiting | **PARTIALLY IMPLEMENTED** | [v2 auth](./lib/api-auth.ts) calls a Postgres-backed per-key limiter; table/function definitions are in [schema.sql](./supabase/schema.sql). The alternate [legacy auth](./lib/api-keys.ts) counts rows and inserts per request non-atomically. Policies are not configurable by user, organization, or plan; expensive browser-session AI/build routes do not share this limiter. Limiter headers are limited to `Retry-After`. Remote presence of the RPC is subject to a separate read-only schema check; it is not represented by a dedicated tracked migration. |
| 5 | Billing and credits | **PARTIALLY IMPLEMENTED** | [Pricing configuration](./lib/pricing.ts), [Paystack transaction verification](./lib/payments.ts), [payment initializer](./app/api/payment/initialize/route.ts), [payment verifier](./app/api/payment/verify/route.ts), [Paystack webhook](./app/api/payment/webhook/route.ts), [credit RPC](./supabase/schema.sql), and [payment migration](./supabase/migrations/20261009150000_fix_payment_feature_ambiguity.sql). Standard, Pro, and Unlimited exist, and monthly/quarterly/yearly amounts are environment-configured. Subscription payment confirmation calls Paystack’s verification API and an idempotent row-locking RPC; credit consumption is row-locked in SQL. The initializer ignores the result of inserting its pending payment row. Hosting-renewal webhook side effects are applied from signed event metadata without calling the transaction verification flow or confirming the registered amount/reference. Full Paystack integration tests require provider credentials and test transactions. |
| 6 | Templates marketplace | **PARTIALLY IMPLEMENTED** | [Template data](./data/website-templates.ts), [listing/search API](./app/api/templates/route.ts), [export API](./app/api/templates/export/route.ts), and [template pages](./app/templates). Real static template metadata, search/filter and detail pages exist. Export generates a generic two-page scaffold with explicit client-content/contact placeholders rather than applying the selected template to a saved cloud project. No paid marketplace, licensing, creator, rating, purchase, or fulfilment flow exists; these are not represented as implemented. |
| 7 | Teams and organizations | **PARTIALLY IMPLEMENTED** | [Organization APIs](./app/api/organizations), [organization migration](./supabase/migrations/20261009170000_organization_membership_hardening.sql), [organization schema](./supabase/schema.sql), and [projects API](./app/api/v2/projects/route.ts). Organizations and direct existing-user membership with role fields exist. The migration creates invitation storage, but no invitation send/accept flow is implemented. Member APIs require organization ownership, but roles are not enforced as capabilities and project queries continue to filter by individual `user_id`; joining an organization does not establish complete shared project access. Organization creation uses separate writes for organization and owner membership. |
| 8 | Plugin system | **PARTIALLY IMPLEMENTED** | [Manifest/registry](./lib/plugins.ts) and [plugin route](./app/api/plugins/route.ts). The server validates versioned metadata and permissions, owner-gates registration, and does not execute arbitrary code—appropriate safety boundaries. Registry state is an in-memory `Map`, with no persistence, installation lifecycle, compatibility enforcement beyond a literal API version, or isolated runner. It is a trusted metadata registry, not a production plugin platform. |
| 9 | AI agent workflows | **PARTIALLY IMPLEMENTED** | [Agent execution](./app/api/agents/run/route.ts), [approval](./app/api/agents/approve/route.ts), [cancellation](./app/api/agents/cancel/route.ts), [run history](./app/api/agents/runs/route.ts), [registry](./lib/agents/registry.ts), and [manager](./lib/agents/manager.ts). Runs and approvals persist and consequential agents can require explicit approval. Most work executes synchronously in the HTTP request. No durable queue/worker, scheduling, general retry/resume, or running-task cancellation/lease system was verified. Existing `background_tasks` table alone does not establish an operational worker. |
| 10 | CLI | **PARTIALLY IMPLEMENTED** | [CLI package](./packages/cli), [CLI entrypoint](./packages/cli/src/index.mjs), [coordination helpers](./packages/cli/src/orchestration.mjs), and [CLI tests](./tests/cli-orchestration.test.mjs). Login validates against the real API before local secure-permission config storage; project listing/creation, local workspace linking, path fences, Git worktrees, and a bounded metadata scratchpad exist. `deploy --brief`/`ship` are intentionally unavailable because no API-key build/deployment contract exists; status is metadata, not streaming telemetry. Package is not published. |
| 11 | Community | **MISSING** | No first-party community, moderated forum, or external community integration was found. Forum-style entries in [template data](./data/website-templates.ts) are customer website templates, not a LeonardX community. The Wall of Love is a testimonial feature, not a community. |
| 12 | Analytics and audit logs | **PARTIALLY IMPLEMENTED** | [Analytics page](./app/analytics/page.tsx), [developer usage route](./app/api/developers/usage/route.ts), [API request-log schema](./supabase/schema.sql), [observability API](./app/api/observability/route.ts), and [admin overview](./app/api/admin/overview/route.ts). Actual AI usage, payment, deployment and system-event tables exist. `recordApiRequest` has no usage call sites; legacy `api_usage` rows are inserted during authentication with status `200` before the actual handler outcome. The page/API named `audit` is an unauthenticated external-site heuristic checker, not an immutable security audit log; it fetches a user-supplied URL with redirect following and requires an SSRF fix. |
| 13 | Documentation and API playground | **PARTIALLY IMPLEMENTED** | [API docs](./app/docs/api/page.tsx), [SDK docs](./app/docs/sdk/page.tsx), [developer docs](./app/developers/docs/page.tsx), and [playground proxy](./app/api/docs/playground/route.ts). The playground is allowlisted to real local API paths and sends the supplied key to those endpoints without exposing server environment variables. It covers only a few read/write operations, has no verified request-size/rate-limit controls, and does not provide a comprehensive typed contract for all API versions. |

## Route inventory

The App Router page inventory was discovered from the repository (dynamic segments are shown literally). Not every route was interactively browser-tested; the inventory is not a claim of full UX acceptance.

### Pages

`/`, `/about`, `/account`, `/admin`, `/admin/agents`, `/admin/announcements`, `/admin/leo/training`, `/admin/upgrade-history`, `/agents`, `/analytics`, `/api-keys`, `/app`, `/audit`, `/auth`, `/blog`, `/blog/build-website-10-minutes-5000`, `/blog/freelancers-ai-10x`, `/blog/leo-vs-chatgpt`, `/blog/leo-vs-chatgpt-nigeria`, `/blog/nigerian-freelancers-ai-10x`, `/contact`, `/dashboard`, `/dashboard/websites/[id]`, `/deployments`, `/developers`, `/developers/docs`, `/docs`, `/docs/api`, `/docs/sdk`, `/ide/[workspaceId]`, `/integrations`, `/leo-ai`, `/notifications`, `/observability`, `/organizations`, `/payment/callback`, `/payment/hosting-renewal`, `/payment/manual`, `/payment/website`, `/portfolio`, `/pricing`, `/privacy`, `/projects`, `/projects/[slug]`, `/refund-policy`, `/resources`, `/setup`, `/setup/keys`, `/status`, `/support`, `/team`, `/templates`, `/templates/[id]`, `/terms`, `/tutorials`, `/wall-of-love`, `/webhooks`, and `/whats-new`.

### API route handlers

Admin: `/api/admin/2fa`, `/api/admin/agents`, `/api/admin/announcements`, `/api/admin/hosting`, `/api/admin/leo/training/{audit,config,conflicts,documents,jobs,knowledge,memory,rollback,test,web}`, `/api/admin/overview`, `/api/admin/upgrade-history`.

Agents and observability: `/api/agents/{approve,browser,cancel,run,runs,video}`, `/api/observability`, `/api/audit`.

Auth and core product: `/api/auth/{login,logout,me,signup}`, `/api/build-deploy`, `/api/chat`, `/api/contact`, `/api/dashboard`, `/api/file-review`, `/api/generate-image`, `/api/generate-visual`, `/api/lead`, `/api/memory`, `/api/notifications`, `/api/research`, `/api/speak`, `/api/voice`, `/api/whats-new`.

Developer platform: `/api/developers/{api-keys,usage}`, `/api/developers/webhooks`, `/api/developers/webhooks/{deliveries,test}`, `/api/docs/playground`, `/api/plugins`, `/api/v1/projects`, `/api/v1/projects/[id]`, `/api/v1/usage`, `/api/v2/me`, `/api/v2/projects`, `/api/v2/projects/[id]`, `/api/v2/projects/[id]/status`, `/api/v2/usage`, `/api/v2/webhooks`, `/api/v2/webhooks/[id]`, `/api/v2/webhooks/[id]/test`.

Other operations: `/api/cron/{hosting,webhooks}`, `/api/google/{analytics,search-console/submit}`, `/api/hosting/renew`, `/api/internal/webhooks/worker`, `/api/organizations`, `/api/organizations/[id]/members`, `/api/payment/{initialize,verify,webhook}`, `/api/payment/website/initialize`, `/api/projects/chatbot/{chats,knowledge}`, `/api/projects/seo`, `/api/pricing`, `/api/setup/{context,payment-option,projects}`, `/api/templates`, `/api/templates/export`, `/api/testimonials`, `/api/workspaces/[id]/files`.

## Database and deployment evidence

- Local migration files: `20261008_api_keys.sql`, `20261008121000_webhooks.sql`, `20261009150000_fix_payment_feature_ambiguity.sql`, `20261009170000_organization_membership_hardening.sql`, and `20261009180000_webhook_delivery_claim.sql`.
- `supabase migration list` returned matching local and remote versions for all five files; there was no pending migration at audit time.
- Read-only remote `information_schema` inspection found `api_keys.revoked` (not `revoked_at`), `api_rate_limits`, `webhooks`, `webhook_endpoints`, `webhook_events`, `organization_invitations`, and a hybrid `webhook_deliveries` table containing columns for both webhook implementations. No row data or secrets were queried.
- `schema.sql` is a broad schema snapshot with duplicated control-plane definitions. Several operational functions/tables appear in it without a clearly matching dedicated migration, so the file should not be blindly replayed against production.
- `vercel.json` schedules hosting enforcement and webhook retries once per day. This satisfies a daily Hobby schedule but does not provide timely execution of the configured webhook retry backoff.
- No migration was applied during this audit.

## Worktree and baseline checks

Initial branch was `main`, aligned with `origin/main`, with pre-existing modifications/untracked work including `.gitignore`, CLI and SDK files, IDE/workspace files, and tests. These were not reverted. `public/leonardx-logo.svg` remains untracked and is not included in audit scope.

| Command / inspection | Audit-time result |
|---|---|
| `npm test` | PASS — 28 tests, 28 passed, 0 failed. Node emitted typeless-module performance warnings for TypeScript files executed with `--experimental-strip-types`. |
| `npm run lint` | FAIL — 18 errors, 20 warnings. Errors include React `set-state-in-effect` and `immutability` diagnostics in existing account/admin/setup/auth-shell/pricing files. |
| `npm run typecheck` | Started; completion not yet confirmed at this audit snapshot. |
| `npm run build` | Started concurrently with the typecheck baseline; completion not yet confirmed. These overlapping checks should be rerun sequentially for authoritative results. |
| `supabase migration list` | PASS — all five local versions matched the linked database. |
| Remote schema read-only query | PASS — schema columns inspected; both webhook generations and shared delivery table confirmed. |

## Highest-priority repair order

1. Prevent unsigned/unverified Paystack hosting-renewal side effects and fail payment initialization when the pending payment row was not persisted.
2. Harden the public URL-audit fetch against SSRF (authentication, DNS/private-address checks, redirect validation, bounded response/time).
3. Consolidate or explicitly retire the duplicate API-key and webhook implementations without deleting production data; preserve existing delivery records with an additive migration only if needed.
4. Connect v2 API outcomes to request logs and make rate-limit behavior auditable; first verify the linked RPC definition and migration history.
5. Define the actual org role/project-sharing contract before changing project authorization; implement invitation acceptance only with secure token handling and transaction-safe membership.
6. Do not expose scheduled agents, plugin execution, CLI deploy/ship, or marketplace purchases as operational until the required worker, sandbox, API, or fulfilment integration exists.

## Not established by this audit

No claim is made that all 13 capabilities are production-complete, that every route has been browser-tested at all breakpoints, that Paystack/Vercel/OpenAI/GitHub operations succeeded live, or that any new database migration or package publication has occurred.

## Follow-up repairs and final verification

The initial audit above was completed before implementation. Targeted follow-up repairs are documented in [LEONARDX_PRODUCTION_READINESS_REPORT.md](./LEONARDX_PRODUCTION_READINESS_REPORT.md). In brief, they added a per-user database-backed rate-limit migration and helper, bounded/authenticated public-site auditing with DNS-pinned fetch and redirect validation, verified and idempotent Paystack hosting renewal handling, pending-payment persistence checks, and selected UI/runtime-state fixes.

The two new migrations are additive but remain unapplied because `SUPABASE_DB_PASSWORD` is unavailable and the linked database dry run failed authentication. No database mutation occurred. Final source checks completed with `npm run verify`: typecheck passed, ESLint had zero errors and 12 warnings, 32 tests passed, and Next.js 16.3.6 production build generated all 149 routes. Browser/responsive and live provider checks were not completed. See the production-readiness report for remaining defects and external setup.
