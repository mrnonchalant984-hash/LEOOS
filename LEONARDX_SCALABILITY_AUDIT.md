# LeonardX scalability audit

Audit date: 2026-10-12. This is an evidence report, not a capacity guarantee.

## Verified baseline

- Next.js 16.3.6 App Router, React 19, Supabase/Postgres, Vercel deployment configuration, Sentry integration, Vercel Analytics/Speed Insights, Paystack payment paths, OpenAI/Leo paths, API-key authentication, webhooks, plugins, SDK and CLI are present in the repository.
- `npm test`: 49 passed, 0 failed.
- `npm run lint`: passed with exit code 0.
- `npm run typecheck`: passed with exit code 0.
- `npm run build`: passed; compilation, Sentry post-compile, TypeScript, static generation and optimization completed.
- Supabase migration `20261012160000_reliability_controls.sql` is applied; `npx supabase migration list` reports matching local and remote migration IDs.
- No load test, restore drill, provider failover test, or multi-instance benchmark has been run. Capacity is therefore **not measured**.

## Current architecture and limits

| Area | Status | Evidence | Risk / next action |
|---|---|---|---|
| API authentication | PARTIAL | [`lib/api-auth.ts`](./lib/api-auth.ts), [`lib/api-keys-core.ts`](./lib/api-keys-core.ts) hash bearer keys, enforce scopes, expiry, revocation and Postgres rate limits. | Add organization/plan dimensions to every expensive API route and contract tests for tenant denial. |
| Tenant isolation | PARTIAL | [`lib/organization-access.ts`](./lib/organization-access.ts) and additive organization columns exist; many service-role queries still require route-by-route predicates. | Build an authorization matrix and negative tests before team workspaces are enabled. |
| Rate limiting | PARTIAL | [`lib/rate-limit.ts`](./lib/rate-limit.ts) and migration RPCs support shared buckets; agent paths use user, IP and provider buckets. | Wire dimensions into all expensive endpoints and monitor limiter failure/latency. |
| Agent jobs | PARTIAL | [`app/api/internal/agents/worker/route.ts`](./app/api/internal/agents/worker/route.ts) has bounded retries; `AGENT_WORKER_ENABLED` is opt-in and requires a scheduler. | Add atomic lease/recovery and deploy a verified worker/scheduler before promising durable execution. |
| Webhooks | PARTIAL | [`lib/webhooks.ts`](./lib/webhooks.ts) is signed, bounded and claim-aware; legacy [`app/api/internal/webhooks/worker/route.ts`](./app/api/internal/webhooks/worker/route.ts) uses a competing schema. | Select one canonical schema/worker and retire the other only after migration parity testing. |
| Payments | PARTIAL | [`lib/payments.ts`](./lib/payments.ts), Paystack routes and payment migrations verify server-side references and amounts. | Complete cancellation, renewal, refund and reconciliation fixtures in sandbox. |
| Observability | PARTIAL | [`lib/monitoring-utils.ts`](./lib/monitoring-utils.ts), Sentry config, [`app/observability-scripts.tsx`](./app/observability-scripts.tsx), and [`app/api/observability/route.ts`](./app/api/observability/route.ts). | Verify ingestion, alerts and owner dashboard data in the provider consoles. |
| Caching | NOT IMPLEMENTED AS A SHARED LAYER | No Redis dependency or shared cache implementation is configured. | Do not add Redis until traces/load results show a shared-cache need. |
| Backups/recovery | NOT VERIFIED | Repository contains no restore drill evidence. | Verify Supabase backup/PITR settings and run an isolated restore drill. |

## Threat and capacity conclusions

The principal risks are authorization omissions in service-role queries, duplicate webhook implementations, scheduler absence for durable jobs, and unverified provider configuration. Serverless instances cannot safely use process memory as the source of truth for rate limits or critical jobs; the current Postgres functions are the right shared primitive, but route coverage is incomplete.

No honest requests-per-second, concurrent-user, p95 latency, or cost ceiling can be stated from this repository alone. Run the bounded non-production scenarios in [`LEONARDX_LOAD_TEST_PLAN.md`](./LEONARDX_LOAD_TEST_PLAN.md) with seeded data and mocked providers.

## Phase order

1. Authorization matrix and cross-tenant negative tests.
2. Canonical webhook schema/worker and payment lifecycle fixtures.
3. Durable worker lease/recovery plus scheduler health checks.
4. Safe load tests and database query-plan review.
5. Provider alert verification, backup restore drill, and measured capacity report.

See [`LEONARDX_RELEASE_AND_SCALE_READINESS.md`](./LEONARDX_RELEASE_AND_SCALE_READINESS.md) for the release gate.
