# LeonardX Observability and Incident Runbook

Date: 2026-10-12

## Status summary

- VERIFIED WITH EVIDENCE: Sentry and monitoring utilities are wired into the repo.
- PARTIAL: the broader observability stack is present but not yet tuned to production operational thresholds.
- BLOCKED: live dashboards, alert thresholds, and runbooks need environment-backed metrics.

## Observability present in repo

- [lib/monitoring.ts](lib/monitoring.ts)
- [lib/monitoring-utils.ts](lib/monitoring-utils.ts)
- [app/api/observability/route.ts](app/api/observability/route.ts)
- [app/global-error.tsx](app/global-error.tsx)
- [next.config.js](next.config.js)

## Recommended observability signals

- request rate, error rate, duration
- auth success/failure rate
- payment verification and webhook latency
- AI first-token and total completion latency
- queue age and retry count
- DB slow query and pool usage
- build/deploy success and duration
- cache hit/miss ratio if caching is introduced

## Incident severity model

| Severity | Example | Response |
|---|---|---|
| Sev1 | payment refund/duplicate billing, auth bypass, major data loss | immediate page; owner incident response |
| Sev2 | AI outage, queue backlog, major webhook failure | within 30m |
| Sev3 | degraded page performance or single feature outage | within 2h |

## Example runbook steps

1. confirm scope and time window
2. fetch latest logs and error traces
3. check provider status (OpenAI, Supabase, Paystack, Vercel)
4. inspect queue age and retry spikes
5. check DB pool and slow query metrics
6. identify whether issue is application, infra, or provider
7. apply mitigation and record change
8. perform postmortem and update action items

## Evidence status

- VERIFIED WITH EVIDENCE: monitoring code and Sentry sanitization exist.
- PARTIAL: alert thresholds and dashboards remain to be operationalized.
- BLOCKED: production alerting requires deployment environment and real metrics.
