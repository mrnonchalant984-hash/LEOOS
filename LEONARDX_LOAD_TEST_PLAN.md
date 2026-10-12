# LeonardX Load Test Plan

Date: 2026-10-12

## Status summary

- VERIFIED WITH EVIDENCE: local build/lint pass; no staging or production load testing was run here.
- IMPLEMENTED BUT NOT VERIFIED: load-test scenarios are defined and can be executed in a controlled environment.
- BLOCKED: real AI provider and DB load tests require staging credentials and budget controls.

## Test tool choice

Recommended: k6 for HTTP/API load work, with explicit mock or synthetic provider behavior for AI paths.

Reason: K6 is lightweight, scriptable, and fits the current Next.js/Supabase architecture without dragging in a large testing stack. It can run against a staging environment or local dev server with a controlled traffic profile.

## Test matrix

| Scenario | Type | Target | Duration | Notes |
|---|---|---:|---:|---|
| Public home page | Smoke/load | 50–200 RPS | 5–10m | static page, CDN/static assets |
| Auth session check | load | 20–80 RPS | 5m | Supabase auth flow |
| Dashboard read | load | 20–60 RPS | 5m | project/dashboard queries |
| Build/deploy API | stress | 5–20 concurrent | 10m | isolated mock or staging builds |
| AI chat request | mock-provider | 5–20 concurrent | 10m | no real expensive AI at scale |
| Queue worker poller | soak | 10–50 jobs/min | 30m | background retries |
| Webhook verification | spike | 20–100 requests/min | 10m | signature and replay checks |
| API key auth denial | load | 50–150 RPS | 5m | 401/403 behavior |

## Example k6 commands

```bash
# smoke test against local/staging
k6 run --vus 10 --duration 2m ./tests/load/public-pages.js
k6 run --vus 20 --duration 5m ./tests/load/auth-api.js
k6 run --vus 10 --duration 10m ./tests/load/ai-mock.js
```

## Safety limits

- No production or external-provider traffic.
- AI scenarios use mocked provider behavior by default.
- Set max concurrency, max VUs, and abort thresholds.
- Keep provider cost caps and job budgets in env variables.
- Rate-limit and timeout tests must be designed not to overload provider accounts.

## Scenarios to run

### 1. Public page / static assets
- VUs: 25, 50, 100
- Ramp: 1m
- Duration: 5m
- Success criteria: 99% success, p95 < 1.5s for home page, no 5xx spikes

### 2. Login and session verification
- VUs: 20
- Duration: 5m
- Validate: auth round-trip, 401/403 for unauthorized requests

### 3. Authenticated dashboard/project reads
- VUs: 10–40
- Duration: 5m
- Validate: p95 < 500–800ms for common reads; no N+1 explosion

### 4. AI mock-provider requests
- VUs: 10–30 concurrent
- Duration: 10m
- Validate: queueing, retries, concurrency limits, user-friendly timeout handling

### 5. Webhook verification and dedupe
- VUs: 10–50
- Duration: 5m
- Validate: duplicate event handling, signature verification, delayed retries

### 6. Queue worker/backlog soak
- Duration: 30m
- Validate: backlog age remains under threshold and memory does not grow unbounded

### 7. Recovery test
- Ramp load to threshold; then step down to baseline; ensure queue drains correctly and no runaway retries occur

## Measurement collection

Capture:

- throughput (RPS)
- p50/p95/p99 latency
- HTTP 2xx/4xx/5xx counts
- timeout rate
- DB pool usage and slow query count
- queue backlog and job age
- provider throttling signals and retry count
- CPU/memory if available

## Current repository limitation

The repository does not contain a ready-to-run staging suite or k6 scripts. This means the plan is actionable but not yet executed here.

## Evidence status

- IMPLEMENTED BUT NOT VERIFIED: load plan and scenarios defined.
- BLOCKED BY EXTERNAL SETUP: running real load tests against Supabase/OpenAI/Paystack or deployed Vercel builds is blocked by missing credentials and staging environment.
