# LeonardX observability and incident runbook

## Signals

- Sentry: sanitized application errors and sampled traces; setup and alert delivery require provider verification.
- Vercel Analytics/Speed Insights: client performance events through [`app/observability-scripts.tsx`](./app/observability-scripts.tsx).
- Database records: API request logs, AI usage, agent runs, webhook deliveries and audit/system events.
- Liveness: [`app/api/health/route.ts`](./app/api/health/route.ts) intentionally checks only process availability.

## Incident procedure

1. Capture the request/job/webhook correlation ID and deployment commit.
2. Check `/api/health`, Sentry release errors, provider status and recent migration status.
3. Separate expected validation/429/payment rejection from application failures.
4. Disable optional worker execution or affected provider feature using existing flags if necessary.
5. Preserve redacted logs; never copy tokens, prompts, payment secrets or private source into an incident channel.
6. Record impact, start/end time, mitigation, root cause and follow-up test.

Alerts are not claimed active until configured and observed in the provider dashboards.
