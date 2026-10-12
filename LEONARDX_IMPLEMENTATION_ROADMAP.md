# LeonardX Implementation Roadmap

This roadmap follows the read-only audit in [`LEONARDX_COMPLETE_GAP_AUDIT.md`](./LEONARDX_COMPLETE_GAP_AUDIT.md). It is a proposed implementation sequence, not a claim that the listed work has been completed.

## Phase 0 — Establish a safe verification environment

**Priority: P0**  
**Dependencies:** staging Supabase project, disposable deployment, provider test credentials.

1. Freeze the current migration directory and record the remote migration list without applying anything.
2. Create a staging data set with separate owner, organization owner, admin, developer, viewer, and unrelated accounts.
3. Configure test-only Paystack, OpenAI, GitHub, Vercel, Resend/Web3Forms, Sentry, and plugin-worker credentials as available.
4. Run the full supported checks in a disposable checkout, including `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
5. Add browser automation for authentication, navigation, project ownership, billing, IDE save, integrations, webhook management, and admin boundaries before changing contracts.

**Exit criteria:** Baseline build result, migration parity record, provider matrix, and reproducible authorization test harness.

## Phase 1 — Payment, tenant, and webhook integrity

**Priority: P0/P1**  
**Dependencies:** Phase 0.

### 1.1 Canonicalize organizations and tenant authorization

- Add a shared organization membership/role authorization service.
- Make organization creation and owner membership atomic through a database function or transaction boundary.
- Implement invitation creation, acceptance, expiry, revocation, role change, and member removal with explicit authorization.
- Require organization predicates in project, build, file, webhook, API-key, plugin, and analytics queries where the product model supports organizations.
- Decide whether projects may be personal, organization-owned, or transferable; encode the rule in constraints and tests.
- Replace static role/metric cards in [`app/organizations/page.tsx`](./app/organizations/page.tsx) with actual authorized data.

**Exit criteria:** Cross-tenant matrix passes for every relevant route; owner/admin/developer/viewer permissions are enforced server-side; no application query relies on UI-only authorization.

### 1.2 Complete Paystack subscription lifecycle

- Store provider subscription/customer identifiers where needed.
- Map verified provider disable/cancel/renewal events to local subscription state without rewriting historical payments.
- Test duplicate, reordered, concurrent, failed, abandoned, mismatched, and replayed webhook events.
- Verify credit/feature entitlement changes are atomic and idempotent through the existing RPC boundary.
- Confirm Free, Standard, Pro, and Business display/internal mapping and all billing periods against the authoritative pricing configuration.

**Exit criteria:** Payment state changes only after trusted server verification; duplicate events produce one entitlement change; cancellation and renewal behavior is documented and tested.

### 1.3 Select one webhook architecture

- Retire or adapt the parallel `webhooks`/`webhook_events` worker path after schema review.
- Use one canonical endpoint/delivery/event schema with immutable event ID, source, event type, payload hash, attempts, claim lease, status, and error fields.
- Expand the allowlist from `webhook.test` to only implemented product events, then wire Paystack/Vercel/GitHub producers one at a time.
- Add idempotency constraints and a durable queue/cron cadence appropriate to retry guarantees.
- Add delivery management, safe manual retry, event detail redaction, and per-endpoint authorization.

**Exit criteria:** Provider fixture creates exactly one delivery per event/endpoint, retries are bounded, concurrent workers cannot double-claim, and the UI reports actual delivery status.

## Phase 2 — Truthful integrations and operational security

**Priority: P1**  
**Dependencies:** Phase 0; provider credentials.

1. Keep [`app/integrations/page.tsx`](./app/integrations/page.tsx) clearly configuration-only and aligned with the sanitized owner-only status center; its misleading verified marker has been removed.
2. Keep owner-only connection tests behind [`app/api/setup/integrations/status/route.ts`](./app/api/setup/integrations/status/route.ts); add provider-specific timeout, rate-limit, and failure tests.
3. Verify Supabase, OpenAI, Paystack, Vercel, GitHub, Google, Resend, and Web3Forms in staging without sending paid transactions or unsolicited messages.
4. Keep Stripe and WhatsApp explicitly unavailable until an approved implementation exists.
5. Move CSP from report-only to enforced in staging after collecting required origins, then production after authenticated flow regression.
6. Complete Sentry controlled-event verification, source-map policy, retention/cost settings, and alert rules. Verify Speed Insights after a real deployment; do not infer it from the package installation.
7. Add public readiness only if it stays generic; keep dependency details and credentials owner-only.

**Exit criteria:** Every displayed state has evidence, no generic page contradicts the integration center, CSP enforcement passes core flows, and provider dashboards show verified events.

## Phase 3 — Durable Leo/agent execution

**Priority: P1**  
**Dependencies:** Phase 1 authorization and usage model; provider limits.

1. Define a durable job schema with owner/organization, task hash, idempotency key, status, approval state, attempt count, lease, timestamps, safe result/error, and cancellation token.
2. Move long-running `runAgent` work out of the request lifecycle into a worker or supported queue.
3. Add schedule, resume, retry, cancel, approval, timeout, and heartbeat transitions.
4. Enforce plan/credit limits at job acceptance and at provider execution, with atomic deduction/refund semantics for failures.
5. Record safe execution/audit events without prompts, secrets, private code, or generated content.
6. Add owner-only browser/video agent tests and explicit approval expiry/replay behavior.

**Exit criteria:** A worker restart does not lose jobs; duplicate submissions are idempotent; users see accurate queued/running/failed/completed states; consequential actions require approval.

## Phase 4 — Developer platform contracts

**Priority: P2**  
**Dependencies:** Canonical API and webhook contracts; Phase 1 authorization.

### SDK

- Generate or maintain types from the implemented OpenAPI v1 document.
- Add only verified methods for usage, webhook management/deliveries, and supported deployment/status operations.
- Add a clean consumer-project compile and published-package smoke test.
- Keep deployment/task/plugin methods out of the SDK until their API contracts are real.

### CLI

- Remove the self-referential `@leo-os/cli` dependency if confirmed unnecessary and regenerate the package lockfile in a separate approved change.
- Add command tests for login, init, status, project list/create, errors, permissions, and safe credential storage.
- Implement `deploy`/`ship` only after authenticated task/deployment endpoints and durable job status exist; otherwise keep the explicit refusal.
- Verify package tarball contents and registry installation from a clean machine before claiming publication.

### Web IDE

- Add browser tests for load/save/empty/error states, concurrent writes, ownership, and mobile layout.
- Keep the console non-shell unless a separate sandboxed execution architecture is approved.

### Documentation/playground

- Correct stale Integration Studio plugin wording.
- Document exact endpoint coverage, scopes, limits, error codes, and webhook events.
- Require authenticated/owner access and strict no-storage handling for any interactive playground that accepts credentials.

**Exit criteria:** SDK/CLI/docs describe only implemented operations, clean consumer installation succeeds, and every documented endpoint is contract-tested.

## Phase 5 — Product completeness and UX quality

**Priority: P2**  
**Dependencies:** Stable contracts from Phases 1–4.

1. Replace static organization and operational metrics with real authorized data or explicit empty states.
2. Add route-level loading/error/empty/permission states to project, deployment, analytics, webhooks, integrations, and admin surfaces.
3. Complete public sitemap allowlisting and route-specific metadata.
4. Resolve all 11 lint warnings, replacing internal `location` navigation and flagged raw images where appropriate.
5. Run keyboard, screen-reader, reduced-motion, touch, and viewport tests at 320, 375, 390, 430, 768, 1024, and 1440+ widths.
6. Profile the global shell and defer noncritical 3D/background/Leo widget code on authenticated routes if measurements justify it.
7. Decide whether Community is an external link or a real supported product area; do not fabricate activity.

**Exit criteria:** No known dead internal navigation, no misleading static success/status metrics, accessibility checks pass, and performance changes are measured rather than assumed.

## Phase 6 — Production release gate

**Priority: P0**  
**Dependencies:** All previous phases.

- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run verify` in a clean checkout.
- Review the complete diff and generated route/type output.
- Run database migration dry-run and inspect production migration parity; apply only with explicit approval.
- Validate payment, authentication, tenant isolation, webhook signature/idempotency, API-key revocation, plugin token, health, Sentry sanitization, and CSP enforcement.
- Verify Vercel deployment, cron invocation, provider dashboards, alert routing, rollback path, backups, and restore procedure.
- Publish SDK/CLI only after clean-package verification and explicit release approval.
- Record measured results and unresolved defects in a release report; do not use “production ready” while P0/P1 defects remain.

## Dependency summary

| Work | Depends on |
|---|---|
| Payment lifecycle | Migration/RPC parity, staging Paystack credentials |
| Webhook event delivery | Payment/provider event contracts, canonical schema |
| Organization isolation | Existing projects/build/files model and RLS review |
| Durable agents | Authorization, credits, provider limits, job schema |
| CLI deploy/ship | Durable task/deploy API and job status |
| SDK expansion | Stable OpenAPI v1 and endpoint contract tests |
| Plugin expansion | Trusted registry/runtime threat model and tenant permissions |
| CSP enforcement | Inventory of deployed external origins |
| Monitoring alerts | Provider accounts, DSN/project setup, verified ingestion |
| Production release | All P0/P1 gates and explicit migration/deploy approval |

## Definition of done for the next approved implementation change

The first approved implementation change should be narrowly scoped to Phase 1: canonical authorization/payment/webhook integrity. It should include tests, a migration dry-run only, no production migration, and an updated evidence report. Features should remain explicitly partial or blocked until their real external and runtime dependencies are verified.
