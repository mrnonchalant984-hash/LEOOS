# LeonardX Queues and Workers Design

Date: 2026-10-12

## Status summary

- VERIFIED WITH EVIDENCE: webhook retries and queued async work exist in the code.
- PARTIAL: the current queue design is a lightweight cron-driven polling model, not a fully durable distributed queue.
- BLOCKED: a production queue service and worker coordination are not yet justified by environment-backed evidence.

## Existing async patterns

The main queue-like mechanism in this repo is the webhook delivery flow:

- [app/api/internal/webhooks/worker/route.ts](app/api/internal/webhooks/worker/route.ts)
- [lib/webhooks.ts](lib/webhooks.ts)
- [app/api/cron/webhooks/route.ts](app/api/cron/webhooks/route.ts)

This pattern polls `webhook_deliveries` rows and retries based on `next_attempt_at`.

## Current design assessment

Good parts:

- job state stored in durable DB
- retries with exponential backoff are attempted
- status and last_error are retained
- worker checks active/valid endpoints before sending

Gaps:

- no true managed queue service
- no job leasing/heartbeat for multi-instance ownership
- no explicit dead-letter queue workflow beyond failed status
- no strong central metrics dashboard for queue age and retries
- no guaranteed run cadence from cron if scheduler is misconfigured

## Recommended durable job design for future scale

- Use a durable table with fields: id, type, status, payload, attempts, max_attempts, next_attempt_at, leased_by, leased_until, created_at, updated_at, error.
- Add unique idempotency keys for external side effects (payments, project deploys, webhook sends).
- Use bounded retry policy with jitter.
- Add dead-letter records and replay workflow.
- Respect tenant limits and global concurrency quotas.
- Add explicit cancellation, timeout, and timing cutoff rules.

## Security and integrity requirements

- Do not duplicate payments or credits.
- Require idempotency keys for deploy, payment, and webhook endpoints.
- Store correlation IDs in logs and job records.
- Prevent retry storms by capping attempts and backoff.

## Implementation status

- IMPLEMENTED BUT NOT VERIFIED: DB-backed delivery retry flow exists.
- PARTIAL: a stronger distributed queue is not yet necessary for current maturity but will be needed if concurrent builds and AI tasks become substantial.
- NOT APPLICABLE: full queue service such as Redis/BullMQ may be unnecessary until the workload justifies it.

## Recommendation

Keep the current Supabase-backed queue while the product is still modest, but add:

1. queue age metrics
2. delivery retry limits
3. idempotency enforcement
4. explicit observability and runbook

Only move to a managed distributed queue when measured traffic and concurrency justify it.
