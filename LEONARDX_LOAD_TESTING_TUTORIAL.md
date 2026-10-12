# LeonardX load-testing tutorial

Use a non-production base URL, seeded IDs and mocked OpenAI/Paystack/Vercel providers. Begin with the smoke and authorization scenarios in [`LEONARDX_LOAD_TEST_PLAN.md`](./LEONARDX_LOAD_TEST_PLAN.md). Capture p50/p95/p99, 4xx/5xx, queue age, database errors and mock counts. Abort on real provider calls, data leakage, >5% errors or unexpected writes. No capacity result is currently claimed.
