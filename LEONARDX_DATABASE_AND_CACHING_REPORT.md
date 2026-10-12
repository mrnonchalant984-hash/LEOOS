# LeonardX database and caching report

## Current database

Supabase/Postgres is the source of truth for profiles, organizations, projects, payments, credits, API keys, usage, webhooks, agent runs and jobs. RLS is enabled on sensitive tables, while service-role access in route handlers must reapply ownership or membership predicates.

The applied [`20261012160000_reliability_controls.sql`](./supabase/migrations/20261012160000_reliability_controls.sql) adds organization indexes, shared rate-limit buckets, payment lifecycle fields and `agent_jobs` without rewriting existing rows.

## Findings

- Indexes exist for common user/organization and queue access paths, but no representative `EXPLAIN` evidence is recorded.
- Organization creation in [`app/api/organizations/route.ts`](./app/api/organizations/route.ts) uses separate organization and owner-membership writes; a transaction/RPC is required for atomic creation.
- Credits use database-side locking in [`supabase/schema.sql`](./supabase/schema.sql), but concurrency tests against the deployed RPC are not recorded.
- No shared Redis/cache is configured. This is intentional until measurement shows a need; payment, authorization and credit state must never come from a cache.

## Safe next actions

Collect query plans on a staging clone, verify RLS with allowed/denied fixtures, and only then propose indexes or a cache. Define cache keys, TTL, invalidation and tenant boundaries before adding any shared cache.
