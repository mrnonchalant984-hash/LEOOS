# LeonardX queues and workers design

## Current state

The additive `agent_jobs` table and [`app/api/internal/agents/worker/route.ts`](./app/api/internal/agents/worker/route.ts) provide an opt-in queue with three attempts and delayed retries. The worker requires `CRON_SECRET` and `AGENT_WORKER_ENABLED=true`; no scheduler is claimed by this repository.

Webhook retries are implemented in [`lib/webhooks.ts`](./lib/webhooks.ts) with bounded backoff, delivery claims and private-target rejection. A second legacy worker exists at [`app/api/internal/webhooks/worker/route.ts`](./app/api/internal/webhooks/worker/route.ts), so webhook execution is not yet canonical.

## Required production hardening

- Atomic lease acquisition with an expiry and recovery path.
- Per-tenant and global concurrency limits.
- Dead-letter visibility and manual replay with idempotency keys.
- Worker heartbeat, queue age, retry and stuck-job metrics.
- A verified scheduler with a documented frequency and timeout.
- One canonical webhook schema and worker after staged migration parity testing.

Until these are deployed and tested, durable background execution is PARTIAL, not complete.
