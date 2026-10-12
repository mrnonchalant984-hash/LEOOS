# LeonardX multi-instance and capacity report

## Result

The application is compatible with multiple stateless Next.js instances for database-backed state, but multi-instance readiness is NOT VERIFIED. No representative benchmark or failover test has been run.

## Shared-state controls present

- Supabase/Postgres stores sessions, API keys, rate limits, payments, webhooks, agent runs and jobs.
- API rate limits use database RPCs rather than process memory.
- Sentry and Vercel telemetry are external sinks.

## Open risks

- Worker scheduling and lease recovery are not externally verified.
- Provider credentials, connection budgets and deployment limits are not measured.
- Streaming/long-running AI behavior under multiple instances has no load evidence.

Run [`LEONARDX_LOAD_TEST_PLAN.md`](./LEONARDX_LOAD_TEST_PLAN.md) in staging before publishing capacity numbers.
