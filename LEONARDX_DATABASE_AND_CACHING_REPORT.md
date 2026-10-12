# LeonardX Database and Caching Report

Date: 2026-10-12

## Status summary

- VERIFIED WITH EVIDENCE: SQL-heavy application routes exist and the repo compiles.
- PARTIAL: actual Supabase query plans and DB tuning remain unverified because no live DB credentials or staging environment were available here.
- BLOCKED: EXPLAIN/ANALYZE and migration execution require live Postgres access.

## Observed database patterns

The app uses Supabase Postgres heavily across:

- auth/session data via [lib/auth.ts](lib/auth.ts)
- dashboards and runtime data via [app/api/admin/overview/route.ts](app/api/admin/overview/route.ts)
- project data via [app/api/setup/projects/route.ts](app/api/setup/projects/route.ts)
- payment and verification via [lib/payments.ts](lib/payments.ts)
- webhook delivery state via [app/api/internal/webhooks/worker/route.ts](app/api/internal/webhooks/worker/route.ts)
- AI memory/knowledge via [app/api/admin/leo/training/knowledge/route.ts](app/api/admin/leo/training/knowledge/route.ts)

## Query behavior observations

- Several routes use `select('*')` and large row sets rather than narrow projections, which is acceptable for small scale but can create hot spots under load.
- Some dashboards are aggregated in memory on the app server rather than precomputed materialized summaries; this is flexible but can lead to fan-out under heavy usage.
- RLS and service-role usage are present, which is correct for secure server-side writes, but auth/data policy performance needs live benchmarking.

## Caching decisions

Current repo status:

- Browser/public CDN caching is not explicitly configured beyond Next.js defaults.
- No Redis cache or distributed cache layer is present.
- Several expensive operations are still request-driven and should not be cached unless the data is explicitly public and safe.

Safe candidates for future cache layers:

- public static page data and immutable assets
- low-churn reference data that is not user or tenant specific
- frequently read but minimally changing pricing/configuration metadata

Unsafe to cache without strong tenancy isolation:

- user profiles and role data
- payment verification state
- AI output and chat state per user
- credits/subscription entitlements
- webhook delivery state and event payloads

## Proposed cache policy

- TTL: 30s–5m for safe, non-sensitive metadata only
- key format: user or tenant scoped plus resource path
- invalidate on mutation or explicit version bump
- no stale cache for auth or payment state
- no cross-user caching for private data

## Index and migration status

The repo contains a supabase migration system under [supabase](supabase), but the environment did not have valid DB credentials to run `db:dry-run` or apply any migration in this session.

This means the database improvement plan is still a design recommendation, not a validated production optimization.

## Recommended next actions

1. Enable live Supabase query logs.
2. Run `EXPLAIN ANALYZE` for top dashboard and payment endpoints.
3. Add composite indexes for high-traffic filters, ordered queries, and joined lookups once the schema is live.
4. Keep RLS simple and test performance with `EXPLAIN` rather than broad index proliferation.
5. Evaluate cache only after actual workload data shows repeated reads and low churn.

## Evidence confidence

- VERIFIED WITH EVIDENCE: repo architecture and code patterns are as above.
- PARTIAL: DB optimization must be data-driven and live.
- BLOCKED: actual plan and migration validation require a valid Supabase environment.
