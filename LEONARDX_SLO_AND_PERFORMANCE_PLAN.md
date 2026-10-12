# LeonardX SLO and performance plan

These are proposed internal targets, not achieved SLAs. Baselines remain unmeasured unless stated in the release reports.

| SLI | Measurement | Initial target | Alert threshold |
|---|---|---:|---:|
| Public HTML availability | successful `/` and `/api/health` responses | 99.5% monthly | 5-minute error rate >2% |
| Authenticated API latency | server duration excluding client network | p95 <800ms | p95 >1.5s for 10 minutes |
| API server errors | 5xx / non-validation requests | <1% | >2% over 10 minutes |
| Leo first token | request start to first streamed token | p95 <5s | p95 >10s |
| Agent queue acceptance | accepted jobs / valid submissions | >99% | <98% or queue age >5m |
| Webhook processing | verified events applied / valid events | >99.5% | retry backlog >100 or oldest >15m |
| Payment verification | verified sandbox events completed | >99% | any duplicate grant or unresolved mismatch |
| Build/deploy | confirmed provider success / accepted builds | measure first | two consecutive provider failures |

## Release gates

- `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` must pass.
- No P0 authorization, payment, webhook, or secret-handling defect may be open.
- Migration dry run must be reviewed; production apply requires explicit approval.
- Load results must include p50/p95/p99, error rate, queue age and database error counts.

## Error budget

Use a 0.5% monthly availability budget for public/API surfaces initially. Freeze non-critical feature work when the budget is exhausted and prioritize incident remediation. AI/provider failures should be tracked separately from application availability.

Instrumentation sources are Sentry, Vercel telemetry, safe operational logs, `api_request_logs`, `ai_usage`, `agent_runs`, and webhook delivery records. Do not log prompts, secrets, payment credentials or generated private source.
