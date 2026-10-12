# LeonardX Complete Gap Audit

Audit date: 2026-10-12  
Repository: `mrnonchalant984-hash/LEOOS`  
Branch inspected: `codex/leonardx-readiness-20261010`  
Commit inspected: `ff9452a`  
Audit mode: read-only. No application code, configuration, environment variable, package, or database state was changed.

## Scope and evidence rules

This audit is based on the current repository source, migrations, tests, package manifests, and configuration. A route or UI page was not treated as proof that its backend operation works. Provider connectivity was not tested with live credentials, and the production build was intentionally not run because Next.js writes build artifacts and this task prohibits working-tree changes.

The only untracked item observed before and after the audit was the pre-existing `packages/cli/package-lock.json`; it was not opened, modified, or removed.

## Verification results

| Check | Result | Evidence / qualification |
|---|---|---|
| `npm test` | WORKING | 49 tests passed, 0 failed, 0 skipped. Tests cover API keys, SDK, webhooks core, payments core, plugins, health, IDE path safety, OpenAPI, orchestration, monitoring utilities, and URL validation. |
| `npm run lint` | WORKING | Exit code 0. 11 warnings remain: hook dependencies, internal `location` navigation, three raw `<img>` uses, and an anonymous PostCSS export. |
| `npx tsc --noEmit` | WORKING | Exit code 0 with no emitted diagnostics. This was run directly to avoid the repository `typecheck` script's `next typegen` write. |
| `npm run typecheck` | NOT VERIFIED | The script runs `clean`, `next typegen`, and TypeScript; it was not run because the audit forbids generated-file changes. |
| `npm run build` | NOT VERIFIED | Not run because Next build writes `.next` artifacts under the read-only audit constraint. |
| `npm run verify` | NOT VERIFIED | It includes typecheck, lint, tests, and build, so it was not run under the same constraint. |
| Database migration state | NOT VERIFIED | Migration files were inspected locally. No migration was pushed, applied, reset, or queried against production. |
| Provider/deployed behavior | NOT VERIFIED | No live credential or deployment mutation was used during this audit. |

## P0 findings

### P0-1 — Payment webhook and subscription integrity

**Status: PARTIAL**

- **Evidence:** [`app/api/payment/webhook/route.ts`](./app/api/payment/webhook/route.ts) verifies the Paystack HMAC, re-verifies successful transactions, checks reference/amount/currency/metadata, and calls `apply_verified_subscription_payment`. [`lib/payments.ts`](./lib/payments.ts) rejects unregistered references and mismatched ownership, plan, period, amount, and currency. [`supabase/migrations/20261009150000_fix_payment_feature_ambiguity.sql`](./supabase/migrations/20261009150000_fix_payment_feature_ambiguity.sql) and the payment RPCs are the trusted state boundary.
- **What works:** Server-side initialization uses the centralized NGN pricing function and stores a pending ledger row before calling Paystack. The webhook has a constant-time signature comparison and an idempotent response path. Tests in [`tests/payments-core.test.mjs`](./tests/payments-core.test.mjs) cover successful and mismatched renewal intents.
- **Missing/broken:** `subscription.disable` is intentionally not mapped to local subscription state because the local provider subscription identifier is not stored. The webhook implementation is not independently tested end-to-end with a signed HTTP request, duplicate delivery, concurrent application, or the subscription RPC. Production payment behavior remains dependent on Paystack credentials, webhook configuration, and unapplied/applied migration parity.
- **User impact:** A provider-side cancellation may not immediately remove local access. A production schema/RPC mismatch can fail verification after the customer has paid.
- **Security risk:** Payment state is generally server-trusted, but the unimplemented provider cancellation lifecycle is a revenue/access consistency risk.
- **External dependencies:** Paystack secret, public key, callback HTTPS URL, webhook delivery, Supabase RPCs/migrations.
- **Recommended action:** P0: add provider subscription identifiers and a tested cancellation/renewal state machine; add integration tests against a Paystack fixture and concurrency tests around the apply RPC; verify migration status in a controlled environment before launch.
- **Verification method:** Replay signed success, failed, duplicate, cancellation, mismatched-amount, and concurrent webhook fixtures against a staging database and inspect payment/subscription/credit rows.

### P0-2 — Authorization and tenant isolation are inconsistent across organization/project surfaces

**Status: PARTIAL**

- **Evidence:** [`app/api/organizations/route.ts`](./app/api/organizations/route.ts) creates an organization and then inserts the owner membership in a second request. [`app/api/organizations/[id]/members/route.ts`](./app/api/organizations/%5Bid%5D/members/route.ts) authorizes only the organization owner for membership changes. [`supabase/migrations/20261009170000_organization_membership_hardening.sql`](./supabase/migrations/20261009170000_organization_membership_hardening.sql) adds invitations and an organization project column. [`app/organizations/page.tsx`](./app/organizations/page.tsx) is primarily a role-model presentation.
- **What works:** API-key project routes constrain reads and writes by `user_id`; the deployment bridge checks both source project ownership and website project ownership. RLS is enabled on several sensitive tables.
- **Missing/broken:** There is no inspected invitation acceptance/revocation route, role-change route, organization-specific project query path, or complete organization authorization helper used by all relevant project/build/IDE/webhook APIs. Organization creation is not atomic: an insert can succeed while owner membership fails. The migration uses `on delete set null` for project organization ownership, which can leave projects without an organization boundary.
- **User impact:** Team members may see a role model without a complete invitation/workspace workflow; organization permissions may not consistently govern project operations.
- **Security risk:** Service-role queries must reapply every tenant predicate. Any omitted predicate can cross customer boundaries.
- **External dependencies:** Supabase RLS policies and production migration state.
- **Recommended action:** P0: define organization membership/role/project authorization centrally, add transactional organization creation, implement invitation acceptance and role lifecycle, and audit every organization/project/build/file/webhook query.
- **Verification method:** Matrix-test owner/admin/developer/viewer/member/non-member access for every organization and project API using separate test accounts and RLS-enabled staging data.

## P1 findings

### P1-1 — Public integration status has a misleading parallel implementation

**Status: BROKEN**

- **Evidence:** [`app/integrations/page.tsx`](./app/integrations/page.tsx) maps environment-variable presence to `status: 'CONNECTED'`, then renders a `verified` marker. Its copy says actual configuration is enough. In contrast, [`lib/integration-status.ts`](./lib/integration-status.ts) performs owner-only server checks for selected providers and [`app/api/setup/integrations/status/route.ts`](./app/api/setup/integrations/status/route.ts) protects that endpoint with owner authorization and rate limiting. [`app/setup/keys/page.tsx`](./app/setup/keys/page.tsx) uses the newer status center.
- **What works:** The setup status center has explicit states, an allowlist, server-side checks, sanitized messages, and owner authorization.
- **Missing/broken:** `/integrations` still tells users that configuration presence is connected/verified. `/status` intentionally shows configuration only, but the product has two different status semantics without a prominent separation.
- **User impact:** Users can believe Paystack, OpenAI, GitHub, or Vercel is operational when only an environment variable exists.
- **Security risk:** Misleading operational status can cause unsafe production decisions, especially for payments and deployments.
- **External dependencies:** Provider credentials and deployment configuration.
- **Recommended action:** P1: make `/integrations` consume the same sanitized status contract or explicitly label it configuration-only and remove the verified marker. Keep `/setup/keys` as the owner-only connection center.
- **Verification method:** With each provider absent, invalid, and valid in staging, compare every integration page’s badge and explanatory text.

### P1-2 — Webhook infrastructure has two schemas and narrow event coverage

**Status: PARTIAL**

- **Evidence:** [`lib/webhooks-core.ts`](./lib/webhooks-core.ts) allows only `webhook.test`. [`lib/webhooks.ts`](./lib/webhooks.ts) uses `webhook_endpoints`, signs outgoing deliveries, performs DNS/private-address checks, claims deliveries, and retries with bounded backoff. [`supabase/migrations/20261008121000_webhooks.sql`](./supabase/migrations/20261008121000_webhooks.sql) creates `webhook_endpoints` and a compatibility `webhook_deliveries` shape. [`app/api/v2/webhooks/route.ts`](./app/api/v2/webhooks/route.ts) manages API-key endpoints. Separately, [`app/api/internal/webhooks/worker/route.ts`](./app/api/internal/webhooks/worker/route.ts) uses a `webhooks`/`webhook_events` schema and a different delivery shape.
- **What works:** HMAC signing, timestamped signatures, endpoint SSRF defenses, encrypted endpoint secret handling in the v2 creation path, bounded retry helpers, delivery claims, and delivery test endpoints exist. [`tests/webhooks.test.mjs`](./tests/webhooks.test.mjs) covers core signature, retry, claim, URL, and event-allowlist behavior.
- **Missing/broken:** No inspected path connects Paystack/Vercel/GitHub product events to the customer webhook event allowlist; only test events are accepted by the core. The internal worker appears to be a parallel schema/implementation and selects the latest event by type rather than an event ID, which risks delivering the wrong payload when multiple events share a type. The daily Vercel cron in [`vercel.json`](./vercel.json) means retry timing is not near-real-time.
- **User impact:** Customers can configure endpoints and test them but may never receive the promised product events or timely retries.
- **Security risk:** Schema drift and duplicate workers can cause missed, duplicated, or misattributed deliveries.
- **External dependencies:** Supabase migration order, Vercel Cron, provider webhooks.
- **Recommended action:** P1: choose one canonical webhook schema/worker, add immutable event IDs and unique idempotency keys, define real event types, connect each producer, and schedule the worker at an appropriate cadence or use a durable queue.
- **Verification method:** End-to-end fixtures for Paystack, Vercel, and GitHub with duplicate event IDs, concurrent workers, failed endpoints, retries, and delivery history assertions.

### P1-3 — API rate limiting is distributed for API keys but incomplete by actor and plan

**Status: PARTIAL**

- **Evidence:** [`lib/api-auth.ts`](./lib/api-auth.ts) invokes the Supabase `consume_api_rate_limit` RPC at 120 requests/minute per key and emits `Retry-After`. [`supabase/migrations/20261010120000_user_rate_limits.sql`](./supabase/migrations/20261010120000_user_rate_limits.sql) defines the user bucket function. [`lib/rate-limit.ts`](./lib/rate-limit.ts) provides user buckets for selected expensive operations.
- **What works:** API-key limits use a shared database function rather than process memory; expensive routes such as agent runs, checkout, build/deploy, and website audits use user buckets.
- **Missing/broken:** The inspected implementation does not provide separate configurable limits by IP, organization, subscription plan, or provider cost class. Several API-key management and authenticated routes are not wrapped by the user limiter. The exact `consume_api_rate_limit` migration/function was not found in the listed migration set, so production schema parity is not verified.
- **User impact:** Limits may be too coarse for teams and too permissive or unavailable for some expensive paths.
- **Security risk:** Missing abuse controls can increase AI/payment/provider costs and permit denial-of-service patterns.
- **External dependencies:** Supabase RPC deployment and provider/network limits.
- **Recommended action:** P1: verify the API-key RPC migration exists remotely, define plan/org/IP dimensions, and apply a shared limiter to key management, playground, plugin runtime, webhooks, and all expensive AI/build routes.
- **Verification method:** Load-test from multiple instances/identities and assert 429 metadata, fail-closed behavior, and isolation of buckets.

### P1-4 — Agent execution is synchronous and not a durable workflow worker

**Status: PARTIAL**

- **Evidence:** [`app/api/agents/run/route.ts`](./app/api/agents/run/route.ts) inserts run records and executes `runAgent` in the request lifecycle; approval-required tasks are persisted as `waiting_approval`. [`app/api/agents/runs/route.ts`](./app/api/agents/runs/route.ts) reads history and [`app/api/agents/cancel/route.ts`](./app/api/agents/cancel/route.ts) cancels pending approvals. [`lib/agents/manager.ts`](./lib/agents/manager.ts) contains routing/execution logic.
- **What works:** Owner-only and approval-required agent checks, run history, failure updates, rate limiting, and monitoring hooks exist.
- **Missing/broken:** No inspected durable queue, scheduler, resume endpoint, retry policy, worker heartbeat, or cancellation of an already-running provider request exists. Long execution is bounded by request/runtime behavior, not a durable job system.
- **User impact:** Long tasks can be interrupted by serverless limits and cannot be reliably resumed or monitored as a background workflow.
- **Security risk:** Consequential actions need durable approval state and idempotency before being retried.
- **External dependencies:** OpenAI provider and any browser/video agent service.
- **Recommended action:** P1: introduce a durable job contract and worker only after defining idempotency, ownership, approval transitions, usage accounting, and retry semantics.
- **Verification method:** Kill/restart worker scenarios, duplicate submissions, approval expiry, cancellation, retry, and cross-user run access tests.

### P1-5 — Workspace organization boundaries are not fully proven by the IDE route

**Status: PARTIAL**

- **Evidence:** [`app/ide/[workspaceId]/page.tsx`](./app/ide/%5BworkspaceId%5D/page.tsx) renders the workspace component. [`components/ide/WebIde.tsx`](./components/ide/WebIde.tsx) and [`app/api/workspaces/[id]/files/route.ts`](./app/api/workspaces/%5Bid%5D/files/route.ts) implement file editing and bounds; [`lib/ide-files.ts`](./lib/ide-files.ts) and [`tests/ide-files.test.mjs`](./tests/ide-files.test.mjs) cover traversal and size limits.
- **What works:** Relative path validation, file-count/file-size/total-size bounds, authenticated project ownership checks, and a deliberately non-shell preview console are documented and tested.
- **Missing/broken:** The page-level route itself does not show a server-side ownership check before rendering; the security boundary appears in the API/component flow. No test was found for cross-organization access or concurrent file updates.
- **User impact:** The editor is usable for owned projects but its workspace/organization semantics are not complete.
- **Security risk:** Any future server action or file read that bypasses the file API could expose project contents.
- **External dependencies:** Supabase project records and RLS.
- **Recommended action:** P1: centralize workspace authorization and add tenant/concurrency tests; keep the preview console explicitly non-executing.
- **Verification method:** Access the same workspace from owner/member/non-member accounts and race simultaneous PATCH requests.

### P1-6 — Organizations page is mostly declarative, not a complete team product

**Status: PARTIAL**

- **Evidence:** [`app/organizations/page.tsx`](./app/organizations/page.tsx) displays “Supported roles,” “RBAC,” “Shared,” and “RLS” as static presentation. The actual APIs are [`app/api/organizations/route.ts`](./app/api/organizations/route.ts) and [`app/api/organizations/[id]/members/route.ts`](./app/api/organizations/%5Bid%5D/members/route.ts).
- **What works:** Organization creation, listing, owner-only member add/remove, and role values exist in source.
- **Missing/broken:** No invitations, acceptance, role update, organization settings, project assignment, or member-facing UI was found in the inspected routes. The page presents capabilities not exposed through a complete user flow.
- **User impact:** Teams cannot reliably onboard and manage membership from the product.
- **Security risk:** Role labels without complete enforcement can create false confidence in isolation.
- **External dependencies:** Supabase organization tables and RLS.
- **Recommended action:** P1: complete the membership lifecycle and replace static capability counters with database-backed state.
- **Verification method:** Full browser flow and server authorization matrix for all roles.

### P1-7 — Plugin runtime is a trusted remote gateway, not an isolated plugin execution platform

**Status: PARTIAL**

- **Evidence:** [`app/api/plugins/route.ts`](./app/api/plugins/route.ts) requires platform-owner 2FA and registers metadata. [`lib/plugins-core.ts`](./lib/plugins-core.ts) validates HTTPS entrypoints and allowlisted permissions. [`app/api/plugins/runtime/route.ts`](./app/api/plugins/runtime/route.ts) authenticates `PLUGIN_RUNTIME_TOKEN`, checks enabled manifests/permissions, signs a remote request, applies timeout and output limits, and records [`plugin_executions`](./supabase/migrations/20261011100000_plugin_executions.sql).
- **What works:** Persistent manifest metadata, lifecycle status, one-enabled-version uniqueness, permission checks, endpoint HTTPS validation, runtime token comparison, bounded input/output, timeout, and execution telemetry.
- **Missing/broken:** There is no sandboxed third-party code execution, installation lifecycle, approval workflow for remote endpoint changes, replay protection, per-plugin rate limit, or plugin marketplace. The runtime is a network gateway to a trusted HTTPS endpoint and must not be described as arbitrary-code execution.
- **User impact:** Plugin authors must operate their own service; users cannot install/run uploaded code in LeonardX.
- **Security risk:** A compromised enabled endpoint or token can act within declared permissions; SSRF validation is not a complete supply-chain trust model.
- **External dependencies:** A separately deployed HTTPS plugin service and shared runtime token.
- **Recommended action:** P1: keep remote execution opt-in and trusted-only; add per-plugin ownership, rotation, replay/idempotency, audit events, rate limits, and a documented threat model before expanding scope.
- **Verification method:** Contract-test valid/invalid manifests, permission denial, token rotation, timeout, oversized response, remote failure, replay, and execution audit rows.

### P1-8 — Sentry and Speed Insights require external configuration and deployment verification

**Status: BLOCKED BY EXTERNAL SETUP**

- **Evidence:** [`instrumentation.ts`](./instrumentation.ts), [`sentry.server.config.ts`](./sentry.server.config.ts), and [`sentry.edge.config.ts`](./sentry.edge.config.ts) initialize Sentry only when `SENTRY_DSN` exists, with privacy sanitization in [`lib/monitoring-utils.ts`](./lib/monitoring-utils.ts). [`app/status/page.tsx`](./app/status/page.tsx) explicitly says provider health is not checked. The repository includes `@vercel/speed-insights` and an observability component, but actual provider data visibility depends on Vercel project enablement and a deployment.
- **What works:** Request-error hook, release/environment tags, sampling, breadcrumb/event/span sanitization, and generic liveness endpoint exist.
- **Missing/broken:** No evidence in the repository proves an event reached Sentry or that Speed Insights data appears in the Vercel dashboard. Alerts and owner dashboard provider metrics are not verified.
- **User impact:** Operators may believe monitoring is active when environment variables or provider-side settings are missing.
- **Security risk:** Incorrect monitoring assumptions delay incident response; privacy controls must remain enabled.
- **External dependencies:** Sentry DSN/auth token/project settings and Vercel Speed Insights project enablement/deployment.
- **Recommended action:** P1: complete provider-side setup, trigger a controlled non-production event, verify dashboard ingestion, configure alerts manually, and document retention/cost settings.
- **Verification method:** Controlled staging error, sanitized event inspection, real-user event after deployment, and owner-only dashboard authorization test.

### P1-9 — Production CSP is report-only

**Status: PARTIAL**

- **Evidence:** [`next.config.js`](./next.config.js) sends `Content-Security-Policy-Report-Only`, while other headers such as HSTS in production, frame denial, referrer policy, and permissions policy are configured.
- **What works:** Security headers are centralized and HSTS is conditional on production mode.
- **Missing/broken:** The CSP does not enforce restrictions. Required external origins have not been demonstrated in a staging CSP enforcement pass.
- **User impact:** Browser policy violations are observed but not prevented.
- **Security risk:** XSS/script-injection defense is weaker than an enforced policy.
- **External dependencies:** Actual deployed origins for Sentry, Supabase, Paystack, OpenAI/browser flows, analytics, and any embedded content.
- **Recommended action:** P1: collect report-only violations, create an allowlist, enforce in staging, then enforce in production with rollback monitoring.
- **Verification method:** Browser console/report endpoint review and authenticated flow regression under enforced CSP.

### P1-10 — API playground accepts secrets in a server request body

**Status: PARTIAL**

- **Evidence:** [`app/api/docs/playground/route.ts`](./app/api/docs/playground/route.ts) accepts `api_key` in JSON, forwards it to supported internal routes, and returns status/body. [`app/docs/api/page.tsx`](./app/docs/api/page.tsx) describes the playground as illustrative and not a credential-collecting live tool in some flows, while the route itself is a real proxy.
- **What works:** Target allowlist, supported method/path validation, no-store response, and no arbitrary URL proxying.
- **Missing/broken:** There is no inspected authentication/rate limit on the playground route, and the endpoint’s handling of user-provided API keys is not clearly documented as a sensitive operation. It returns response bodies from the target to the caller.
- **User impact:** Developers may paste production keys into a page they do not understand.
- **Security risk:** Key leakage through browser history, logs, client telemetry, proxy errors, or abuse of the unauthenticated proxy endpoint.
- **External dependencies:** API-key route and deployment logging.
- **Recommended action:** P1: prefer browser-local authenticated calls where safe, or require signed-in owner/developer access, rate-limit the proxy, disable request/response logging, and add explicit no-storage/privacy copy.
- **Verification method:** Inspect Vercel/Supabase logs, test unauthorized access/rate limits, and verify secrets never appear in response headers, errors, telemetry, or logs.

## P2 findings

### P2-1 — CLI is published-capable for supported metadata operations, but deploy/ship are explicit boundaries

**Status: PARTIAL**

- **Evidence:** [`packages/cli/package.json`](./packages/cli/package.json) exposes `leo` and `leonardx`; [`packages/cli/src/index.mjs`](./packages/cli/src/index.mjs) implements login, init, status, project list/create, logout, agent strategy, worktree, and scratchpad commands. [`packages/cli/README.md`](./packages/cli/README.md) states that cloud deploy/ship do not submit tasks. The package declares `@leo-os/cli` as its own dependency, which is suspicious and should be checked before consumers install it.
- **What works:** API-key login validates `/api/v1/me` before storing credentials; local config uses restrictive file permissions; supported project commands call real v1 endpoints; orchestration helpers have tests.
- **Missing/broken:** `leo deploy --brief` and `leo ship` are not cloud operations. No npm registry publication was verified during this repository audit.
- **User impact:** Users may install the CLI but cannot use the advertised cloud dispatch/deployment commands.
- **Security risk:** Local config protection is platform-dependent; Git worktrees are not process or OS sandboxes.
- **External dependencies:** npm publication, API-key scopes, authenticated API endpoints.
- **Recommended action:** P2: correct package dependencies/lockfile, test installation from a clean consumer project, and either implement authenticated job/deploy contracts or keep commands clearly unavailable.
- **Verification method:** `npm pack`/clean install, CLI command tests, API-key auth tests, and real staging deploy contract.

### P2-2 — SDK is a useful typed v1 client but has narrow endpoint coverage

**Status: PARTIAL**

- **Evidence:** [`packages/sdk/src/index.ts`](./packages/sdk/src/index.ts) exposes typed project list/create/status, error classes, rate-limit parsing, and webhook signature verification. [`packages/sdk/README.md`](./packages/sdk/README.md) explicitly limits coverage to these operations. [`tests/sdk.test.mjs`](./tests/sdk.test.mjs) covers requests/errors/signatures/orchestration.
- **What works:** Server-side bearer handling, typed responses, request IDs, 429 handling, no dependency runtime design, and signature verification.
- **Missing/broken:** No typed usage, webhook management/delivery, deployment, organization, plugin, or job methods are exported. Package publication was not independently verified in this audit.
- **User impact:** Integrators need raw HTTP for most developer-platform capabilities.
- **Security risk:** Users may assume SDK coverage that does not exist and implement unsafe ad hoc calls.
- **External dependencies:** npm registry and live API contract.
- **Recommended action:** P2: generate or maintain types from the actual OpenAPI document and add only verified endpoint methods with contract tests.
- **Verification method:** Clean install, typed compile in a consumer project, mocked contract tests, and staging API calls.

### P2-3 — IDE is a protected file editor, not a build/deploy terminal

**Status: WORKING**

- **Evidence:** [`app/ide/page.tsx`](./app/ide/page.tsx), [`components/ide/WebIde.tsx`](./components/ide/WebIde.tsx), [`app/api/workspaces/[id]/files/route.ts`](./app/api/workspaces/%5Bid%5D/files/route.ts), [`lib/ide-files.ts`](./lib/ide-files.ts), and [`tests/ide-files.test.mjs`](./tests/ide-files.test.mjs).
- **What works:** The documented editor supports authenticated file load/save with path and byte limits; the console intentionally supports only `help`, `ls`, `cat`, and `clear` and rejects shell/build/deploy semantics.
- **Missing/broken:** Preview/build/deploy integration is not part of this editor contract.
- **User impact:** Clear if the current copy is retained; users expecting a real shell need a separate supported execution product.
- **Security risk:** Reduced by not executing arbitrary code in the request process.
- **External dependencies:** Supabase project files and auth.
- **Recommended action:** P2: add browser tests for file save/error/empty states and keep capability boundaries explicit.
- **Verification method:** Authenticated UI flow plus cross-user and traversal tests.

### P2-4 — Integration Studio is intentionally simulated and contains stale plugin wording

**Status: PARTIAL**

- **Evidence:** [`lib/integration-studio.ts`](./lib/integration-studio.ts) labels API/SDK/CLI/IDE/plugin/webhook walkthrough outputs as simulations or examples. Its plugin scenario still says persistence is a process-local Map, while current [`lib/plugins.ts`](./lib/plugins.ts) and [`supabase/migrations/20261010140000_plugin_manifests.sql`](./supabase/migrations/20261010140000_plugin_manifests.sql) are durable metadata.
- **What works:** Tests in [`tests/integration-studio.test.mjs`](./tests/integration-studio.test.mjs) verify each walkthrough and that it avoids claiming live execution.
- **Missing/broken:** Documentation is stale for plugins and should distinguish a real remote gateway from a simulation. The studio is not an interactive live API/deployment tutorial.
- **User impact:** Developers receive contradictory capability information.
- **Security risk:** Stale claims can lead to unsafe integration assumptions.
- **External dependencies:** Current API and plugin registry contracts.
- **Recommended action:** P2: update tutorial data after contract review and add a separate explicitly authenticated playground if needed.
- **Verification method:** Compare every tutorial claim against route tests and live staging behavior.

### P2-5 — SEO inventory is incomplete and dynamic metadata is weak

**Status: PARTIAL**

- **Evidence:** [`app/robots.ts`](./app/robots.ts) disallows private route prefixes and references a sitemap. [`app/sitemap.ts`](./app/sitemap.ts) lists a fixed subset of pages, includes authenticated/private paths such as `/dashboard`, `/admin`, `/setup/keys`, and assigns `new Date()` at request time. [`app/layout.tsx`](./app/layout.tsx) supplies global metadata.
- **What works:** Robots and sitemap routes exist; API/admin/auth paths are disallowed in robots.
- **Missing/broken:** The sitemap includes routes that should not be public and omits many public pages. Metadata is globally shared rather than route-specific for much of the app. The production base URL is hardcoded as a fallback.
- **User impact:** Search engines may receive irrelevant/private URLs and less useful page titles/descriptions.
- **Security risk:** Robots is not access control, but publishing private URLs increases discovery surface.
- **External dependencies:** Correct production domain environment variable.
- **Recommended action:** P2: produce a public-route allowlist sitemap, remove authenticated/private routes, and add page-specific metadata.
- **Verification method:** Fetch robots/sitemap, compare to route inventory, and inspect search crawler output in staging.

### P2-6 — Accessibility is generally strong but lint identifies maintainability and navigation issues

**Status: PARTIAL**

- **Evidence:** `npm run lint` exited 0 with warnings in [`app/admin/announcements/page.tsx`](./app/admin/announcements/page.tsx), [`app/admin/leo/training/page.tsx`](./app/admin/leo/training/page.tsx), [`app/admin/page.tsx`](./app/admin/page.tsx), [`app/admin/upgrade-history/page.tsx`](./app/admin/upgrade-history/page.tsx), [`app/dashboard/websites/[id]/page.tsx`](./app/dashboard/websites/%5Bid%5D/page.tsx), [`app/notifications/page.tsx`](./app/notifications/page.tsx), [`app/projects/[slug]/page.tsx`](./app/projects/%5Bslug%5D/page.tsx), [`components/LEOWidget.tsx`](./components/LEOWidget.tsx), and [`postcss.config.mjs`](./postcss.config.mjs).
- **What works:** No lint errors; visible focus and semantic controls are present in many reviewed pages.
- **Missing/broken:** 11 warnings include missing hook dependencies, internal `window.location` navigation, and raw `<img>` elements that can harm LCP. No complete automated keyboard/screen-reader/mobile matrix was found in the repository.
- **User impact:** Possible stale data, full-page navigations, slower images, and unverified keyboard behavior.
- **Security risk:** Low direct risk; stale effects can cause incorrect UI actions.
- **External dependencies:** Browser/device assistive technology.
- **Recommended action:** P2: eliminate warnings, add route-level Playwright/a11y checks, and test keyboard/focus/reduced-motion across authenticated and public layouts.
- **Verification method:** `npm run lint`, axe/Playwright, keyboard-only browser pass, and mobile viewport matrix.

### P2-7 — Performance opportunities remain in the global shell and media

**Status: PARTIAL**

- **Evidence:** [`app/layout.tsx`](./app/layout.tsx) globally mounts `VisualBackground`, `Header`, `GlobalLEOWidget`, `Footer`, providers, and observability scripts for every route. Lint flags raw images in [`app/admin/page.tsx`](./app/admin/page.tsx), [`app/projects/[slug]/page.tsx`](./app/projects/%5Bslug%5D/page.tsx), and [`components/LEOWidget.tsx`](./components/LEOWidget.tsx). [`components/VisualBackground.tsx`](./components/VisualBackground.tsx) and the homepage 3D scene load visual work globally/near globally.
- **What works:** The project has responsive CSS, reduced-motion-related styling in reviewed visual components, and no CLS test failure in the available suite.
- **Missing/broken:** No current Lighthouse/PageSpeed result was generated during this audit, and the repository does not prove that heavy visual/client components are deferred on authenticated routes. Raw images and global client providers are measurable optimization candidates.
- **User impact:** Mobile main-thread work and LCP can regress, particularly on dashboards and low-power devices.
- **Security risk:** Low direct risk.
- **External dependencies:** Browser hardware, 3D/remote media, Vercel caching.
- **Recommended action:** P2: measure route bundles and mobile lab performance, then defer noncritical 3D/background/widget code by route and replace flagged images where safe.
- **Verification method:** Same-device Lighthouse runs, bundle analyzer, browser performance profile, and regression checks on home/dashboard/IDE.

## Additional feature findings

### Developer API keys

**Status: WORKING**

- **Evidence:** [`lib/api-keys-core.ts`](./lib/api-keys-core.ts), [`app/api/developers/api-keys/route.ts`](./app/api/developers/api-keys/route.ts), [`lib/api-auth.ts`](./lib/api-auth.ts), [`supabase/migrations/20261008_api_keys.sql`](./supabase/migrations/20261008_api_keys.sql), and [`tests/api-keys.test.mjs`](./tests/api-keys.test.mjs).
- **Assessment:** Keys are random, prefixed, hashed with SHA-256, returned once, scope-checked, revocable, and expiry-aware. Server APIs never select raw secrets. Gaps are rate limits for key-management endpoints, no observed maximum expiry policy, and non-transactional multi-step rotation.
- **Priority/action:** P1 hardening; add key-management rate limits, maximum TTL/policy, atomic rotation semantics, and audit events.
- **Verification:** Staging create/list/rotate/revoke/expiry/scopes with log inspection.

### Public API/versioning/OpenAPI

**Status: WORKING**

- **Evidence:** [`app/api/v1`](./app/api/v1), [`lib/openapi-v1.ts`](./lib/openapi-v1.ts), [`app/api/openapi/route.ts`](./app/api/openapi/route.ts), and [`tests/openapi-v1.test.mjs`](./tests/openapi-v1.test.mjs).
- **Assessment:** Public routes use `/api/v1`; OpenAPI `info.version` is `1.0.0`; tests verify documented handlers exist. The API is narrow and deploy is a bridge to the existing builder, not a general job API.
- **Priority/action:** P2; keep documentation synchronized and add contract tests for every response shape.
- **Verification:** Generated-client compile and staging requests.

### Billing, plans, credits, free template, hosting

**Status: PARTIAL**

- **Evidence:** [`lib/pricing.ts`](./lib/pricing.ts), [`app/api/pricing/route.ts`](./app/api/pricing/route.ts), [`app/api/payment/initialize/route.ts`](./app/api/payment/initialize/route.ts), [`lib/plan-access.ts`](./lib/plan-access.ts), [`supabase/migrations/20261010130000_hosting_renewal_idempotency.sql`](./supabase/migrations/20261010130000_hosting_renewal_idempotency.sql), [`app/api/templates/export/route.ts`](./app/api/templates/export/route.ts), and [`tests/plan-builders.test.mjs`](./tests/plan-builders.test.mjs).
- **Assessment:** Central integer NGN pricing, monthly/quarterly/yearly totals, `unlimited` to Business display mapping, Paystack server amount selection, free website build limits, and hosting renewal ledger support exist. Internal types still expose `unlimited`, and plan/credit enforcement depends on RPCs and live schema not verified here. `formatNairaKobo` contains an encoding artifact (`â‚¦`) in the inspected source.
- **Priority/action:** P1; verify all plan/credit RPCs and historical subscriptions in staging, normalize display encoding, and test concurrent usage deductions.
- **Verification:** Staging checkout/verification/refund/failure/renewal and concurrent credit tests.

### Templates and export

**Status: PARTIAL**

- **Evidence:** [`app/templates/page.tsx`](./app/templates/page.tsx), [`app/templates/[id]/page.tsx`](./app/templates/%5Bid%5D/page.tsx), [`data/templates.ts`](./data/templates.ts), and [`app/api/templates/export/route.ts`](./app/api/templates/export/route.ts).
- **Assessment:** Template metadata/detail/export exists and the export is free. No paid marketplace ownership, creator, ratings, downloads, or purchase flow was found; exported README explicitly contains placeholders.
- **Priority/action:** P2; add search/categories and real application flow only where supported; do not present a paid marketplace.
- **Verification:** Export archive inspection, project-creation flow, and no-fabricated-metrics review.

### Leo AI, memory, tools, code generation, deployment

**Status: PARTIAL**

- **Evidence:** [`app/api/chat/route.ts`](./app/api/chat/route.ts), [`app/api/memory/route.ts`](./app/api/memory/route.ts), [`app/api/build-deploy/route.ts`](./app/api/build-deploy/route.ts), [`lib/agents/manager.ts`](./lib/agents/manager.ts), [`components/LEOWidget.tsx`](./components/LEOWidget.tsx), and [`app/agents/page.tsx`](./app/agents/page.tsx).
- **Assessment:** Chat, persisted user-scoped memory, OpenAI usage records, project-type/provider checks, GitHub/Vercel build/deploy flow, approvals, and run history exist. Real provider credentials, long-running reliability, tool execution breadth, and deployment behavior were not live-verified. The homepage workflow preview is explicitly illustrative in [`app/page.tsx`](./app/page.tsx).
- **Priority/action:** P1; add durable jobs and staging provider tests; preserve prompts that prohibit invented deployment success.
- **Verification:** Authenticated staging chat, memory isolation, build failure/success, provider outage, approval, and deployment polling tests.

### Authentication, owner access, 2FA, admin

**Status: PARTIAL**

- **Evidence:** [`lib/auth.ts`](./lib/auth.ts), [`app/api/auth`](./app/api/auth), [`app/api/admin/2fa`](./app/api/admin/2fa), [`app/admin/page.tsx`](./app/admin/page.tsx), and [`app/api/admin/overview/route.ts`](./app/api/admin/overview/route.ts).
- **Assessment:** Supabase session/refresh handling, owner email+role check, trusted-device hashing, TOTP routes, and owner overview authorization exist. Full signup, email verification, recovery, session revocation, device lifecycle, and all admin route authorization were not exhaustively runtime-tested.
- **Priority/action:** P1; perform an authorization matrix and verify every admin route, cookie, expiry, and recovery flow.
- **Verification:** Separate-account staging browser tests and API fuzzing.

### Analytics, audit, observability, and fabricated metrics

**Status: PARTIAL**

- **Evidence:** [`app/api/observability/route.ts`](./app/api/observability/route.ts), [`app/api/admin/overview/route.ts`](./app/api/admin/overview/route.ts), [`app/api/developers/usage/route.ts`](./app/api/developers/usage/route.ts), [`supabase/migrations/20261010150000_api_request_logs.sql`](./supabase/migrations/20261010150000_api_request_logs.sql), and [`lib/monitoring.ts`](./lib/monitoring.ts).
- **Assessment:** API usage, AI usage, agent runs, system events, request latency/status, Sentry sanitization, and health liveness exist. Organization-wide audit log completeness, immutable audit records, alert delivery, and live metrics dashboards are not proven. [`app/organizations/page.tsx`](./app/organizations/page.tsx) contains static role metrics rather than live counts.
- **Priority/action:** P1; separate security audit records from product analytics and verify metrics source tables.
- **Verification:** Generate known events and compare authorized reports to exact database rows.

### Integrations

**Status: PARTIAL**

- **Evidence:** [`lib/integration-status.ts`](./lib/integration-status.ts), [`app/setup/keys/page.tsx`](./app/setup/keys/page.tsx), [`app/integrations/page.tsx`](./app/integrations/page.tsx), [`app/api/setup/integrations/status/route.ts`](./app/api/setup/integrations/status/route.ts), [`lib/builders/providers.ts`](./lib/builders/providers.ts), [`app/api/google/analytics/route.ts`](./app/api/google/analytics/route.ts), [`app/api/google/search-console/submit/route.ts`](./app/api/google/search-console/submit/route.ts), and [`app/api/contact/route.ts`](./app/api/contact/route.ts).
- **Assessment:** Supabase/OpenAI/Paystack/Vercel/GitHub/Resend/Web3Forms have configuration or implementation paths; Google has selected service-account routes; Stripe and WhatsApp are explicitly coming soon. No live credentials were tested, and the generic integrations page overstates status.
- **Priority/action:** P1; unify status semantics and verify each provider in staging.
- **Verification:** Owner-only status checks with absent/invalid/valid credentials and safe provider calls.

### 3D/visual system and responsive behavior

**Status: NOT VERIFIED**

- **Evidence:** [`components/VisualBackground.tsx`](./components/VisualBackground.tsx), [`components/DesignWorldScene.tsx`](./components/DesignWorldScene.tsx), [`app/page.tsx`](./app/page.tsx), [`app/globals.css`](./app/globals.css), and [`app/premium-theme.css`](./app/premium-theme.css).
- **Assessment:** Multiple visual systems and Three.js/R3F dependencies are present with reduced-motion/fallback-related code in parts of the implementation. No device matrix or WebGL fallback/performance profiling was run in this audit.
- **Priority/action:** P2; test 320px–1440px, touch, reduced motion, WebGL failure, and authenticated route cost.
- **Verification:** Browser matrix with console/error capture and performance traces.

## External setup and unverifiable items

The following require provider-side or deployment-side confirmation and were not claimed as working:

- Supabase production migration parity, RPC availability, RLS policies, backups, and restore procedure.
- `OPENAI_API_KEY` and model availability for Leo and agent providers.
- `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, plan codes, callback HTTPS URL, and Paystack webhook configuration.
- `VERCEL_TOKEN`, team/project identifiers, GitHub token/repository permissions, and deployment domain.
- Sentry DSN/auth/project settings, source-map upload configuration, alert rules, retention, and controlled event ingestion.
- Vercel Speed Insights project enablement and real-user data after deployment.
- Resend/Web3Forms credentials and sender/domain verification.
- Google service-account scopes/property identifiers.
- `PLUGIN_RUNTIME_TOKEN` and a separately deployed, trusted HTTPS plugin service.
- Vercel Cron activation and execution timing.

## Recommended first implementation phase

Start with P0/P1 integrity work: unify organization authorization, verify the production Supabase migration/RPC set, complete payment subscription lifecycle handling, canonicalize webhook schema/events/worker behavior, and remove the misleading `/integrations` status path. Only after those checks should the team add durable agent jobs or broaden SDK/CLI capabilities.

