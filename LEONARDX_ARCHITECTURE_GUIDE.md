# LeonardX architecture guide

```mermaid
flowchart LR
  Browser --> Next[Next.js App Router]
  Next --> Auth[Supabase Auth]
  Next --> DB[(Supabase Postgres + RLS)]
  Next --> Leo[OpenAI / Leo]
  Next --> Pay[Paystack]
  Next --> Vercel[Vercel builds/deployments]
  Next --> Monitor[Sentry + Vercel telemetry]
  Cron --> Worker[Protected agent/webhook workers]
  Worker --> DB
```

Service-role handlers must reapply user/organization predicates. Payment/webhook state is server trusted. Agent jobs are durable only when the protected worker and scheduler are enabled. See [`LEONARDX_SCALABILITY_AUDIT.md`](./LEONARDX_SCALABILITY_AUDIT.md).
