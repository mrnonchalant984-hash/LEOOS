# LeonardX load-test plan

No production load test has been run. Use a staging project or local mocks only. Do not run these scenarios against Paystack, OpenAI, Vercel, or customer deployments without explicit authorization.

## Scenarios

1. Public page smoke: `/`, `/pricing`, `/api/health` at 1–5 requests/second for 2 minutes.
2. Authenticated reads: seeded users list projects and usage; verify p95 and no cross-user rows.
3. API-key limits: one key exceeds its window; assert `429`, `Retry-After`, and no state mutation.
4. Agent submission: mocked Leo provider, 1 → 5 → 10 concurrent jobs; record queue age and provider calls.
5. Webhook replay: duplicate, stale, invalid-signature, out-of-order and retry fixtures; assert one state transition.
6. Organization denial: users from separate organizations request each other’s project IDs; assert 403/404 and no data leakage.

## Abort criteria

Stop if error rate exceeds 5%, a test writes outside seeded IDs, a real provider call is observed, database connections approach the project limit, or a secret appears in output. Keep each run under 10 minutes and delete only test data created by the run.

## Required evidence

Record command, commit, environment, seed size, concurrency, duration, p50/p95/p99, status distribution, database errors, queue depth/age, and provider mock counts. Until this evidence exists, capacity remains NOT VERIFIED.
