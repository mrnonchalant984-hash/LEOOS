# LeonardX SLO and Performance Plan

Date: 2026-10-12

## Status summary

- VERIFIED WITH EVIDENCE: local build and lint are healthy.
- PARTIAL: SLO targets below are proposed initial targets for the current architecture; they are not yet backed by production latency data.
- BLOCKED: p99 latency, queue age, and AI/provider cost metrics require staging or production instrumentation with real traffic.

## Baseline measurement status

Measured in this environment:

- Lint: `cd /workspaces/LEOOS && npm run lint` -> pass
- Build: `cd /workspaces/LEOOS && npm run build` -> pass

Not measured here:

- real DB query latency under load
- AI first-token latency
- queue depth and age
- browser TTFB on public pages
- real Paystack webhook latencies

## Proposed SLIs and SLOs

| Service | SLI | Target | Window | Measurement method | Status |
|---|---|---:|---|---|---|
| Public pages | p95 page load latency | < 2.5s on broadband | 30d | Web Vitals / server render timing | PARTIAL |
| Auth/session | login/session check success rate | > 99.5% | 30d | App logs + auth API metrics | PARTIAL |
| Authenticated API requests | p95 API latency | < 800ms for reads | 30d | Next.js server timing + DB time | PARTIAL |
| Database-backed dashboard | p95 query latency | < 500ms | 7d | Postgres query logs / Supabase logs | PARTIAL |
| AI first token | p95 first token | < 8s on normal prompts | 30d | OpenAI request logs | PARTIAL |
| AI response completion | p95 completion | < 20s for standard chat | 30d | OpenAI request logs | PARTIAL |
| Queue accept / age | queue acceptance rate | > 99% | 7d | webhook_deliveries + worker logs | PARTIAL |
| Job completion | p95 job completion | < 2m for critical async tasks | 30d | cron + worker log metrics | PARTIAL |
| Payment verification | success rate | > 99.5% on verified provider events | 30d | payment verification logs | PARTIAL |
| Integration availability | API health | > 99% excluding known provider outages | 30d | integration health checks | PARTIAL |

## Error budgets

- Public pages and auth: 0.5% error budget per 30 days.
- Authenticated APIs: 1% budget for 5xx/validation/timeouts, excluding user validation errors.
- AI providers: 5% budget for provider throttling due to outside dependency limits; do not count user-cancelled requests as service failures.
- Payments/webhooks: 0.5% duplicate or failed verified event budget; any negative balance/duplicate credit issue is a P0 incident regardless of budget.

## Definition of error types

- application_error: app threw unhandled exception or returned 5xx
- dependency_failure: provider or DB returned timeout/5xx
- timeout: server-level or provider-level timeout
- rate_limit: 429 or throttling signal
- validation_error: 4xx due to bad request or unauthorized access
- cancelled: client aborted / cancel request

## Monitoring and alert thresholds

- 5xx rate > 2% for 5 minutes -> warn
- p95 API latency > 1.5s for 10 minutes -> warn
- AI provider 429 > 10 requests per 10 minutes -> page to on-call
- queue oldest-job age > 15 minutes for critical jobs -> warn
- payment verification failures > 2 in 15 minutes -> page owner
- DB pool saturation or slow query spike > threshold -> page engineering

## Measurement sources

- Next.js app logs and request timings
- Supabase query logs / Postgres logs
- OpenAI request metrics
- Paystack webhook verification logs
- Sentry/monitoring integration when configured

## Scope of current evidence

This repo has the necessary architecture hooks but no real load/staging dataset. Therefore these SLOs are policy-level targets for the next environment-backed validation, not operational guarantees.

## Release criteria

- All targeted routes compile and pass lint/tests in CI.
- No critical security/data-integrity path remains untested.
- Queue, AI, and payment paths have measurable alerting.
- Staging load tests confirm the service remains under the target p95 and error budgets.
