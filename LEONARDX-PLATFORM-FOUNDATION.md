# LeonardX platform foundation — workflows, API access, and production gates

## Customer-facing UX cleanup

- Removed internal worker/scheduler/lease/retry/staging commentary from Workflow Studio. Customer-facing messages now use plain language and do not expose implementation details or database migration steps.
- Workflow runs and interval schedules are rejected with a generic temporary-unavailability message while the worker is disabled, rather than creating work that cannot execute.
- Replaced the API pricing page's draft price cards and checkout-status warnings with a clean Developer API access request page. The public plans endpoint no longer exposes unapproved draft prices or internal billing flags.
- The NGN API price values remain an internal draft catalog only. The figures (₦0, ₦5,000, ₦25,000, and ₦100,000 monthly) were configured as initial assumptions; they were not derived from verified provider unit economics, competitor research, or approved LeonardX commercial terms. Do not publish or activate them until the pricing model is reviewed and approved.
- Removed implementation notes from the Leo plans page. The welcome-credit message now states the customer benefit without exposing internal metering limitations, and the video panel shows user-facing credit information rather than an internal provider-cost estimate.
- Replaced several video-generation errors that mentioned database migrations or internal credit configuration with plain-language messages.

## Included platform foundation

- Internal draft API pricing catalog kept separate from Leo AI subscriptions and hosting. Public API access is currently request-based until prices and billing are approved.
- Authenticated API access inquiry with strict validation, rate limiting, and database persistence.
- Additive Supabase migration for API inquiry records, subscription-ledger foundation, workflow definitions/runs, interval schedules, durable jobs, idempotency keys, lease expiry/reclaim, and bounded worker/scheduler claims.
- Workflow Studio draft creation and workflow state controls. The worker remains disabled by default; automatic execution must not be enabled until scheduler deployment, timeouts, cancellation, lease-expiry races, output handling, monitoring, and staging tests are complete.
- Static regression tests cover catalog separation, worker gates, public UX copy, and queue controls.

## Required pre-production verification

1. Apply migrations to staging and inspect RLS, grants, foreign keys, and migration order.
2. Implement a billing provider state machine with signed webhook verification, amount/currency/reference checks, idempotent event storage, subscription period reconciliation, cancellation, refund, and dispute paths before selling API plans.
3. Implement transactional API request/credit accounting and server-side plan/organization entitlements; do not rely on client plan values.
4. Complete worker operations before enabling it: scheduled invocation, cancellation semantics, lease-expiry race testing, provider timeouts, secret-redacted outputs, monitoring, and any approval-gated step types. The current worker deliberately excludes browser and image/video agents and does not implement an approval UI.
5. Test tenant isolation, key revocation/expiry/scopes, distributed rate limiting under concurrency, idempotency races, webhook replay, workflow lease expiry, prompt injection, SSRF redirects/DNS rebinding, and provider failures.
6. Run typecheck, lint, full tests, production build, dependency audit, staging payment replay tests, load tests, and backup/restore drills. Targeted tests currently pass; typecheck/build and a complete clean dependency install remain unverified in this environment. Enable billing/worker flags only after the relevant checks pass.

## No production claim

This is a source-level change. It does not prove production security, live database migration success, provider billing correctness, worker availability, or deployment health. No production database migration or deployment was performed. GitHub branch creation was blocked by the connected integration's 403 permission response; no remote branch, PR, or deployment was created.
