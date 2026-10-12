# LeonardX AI platform engineering guide

Leo behavior and safety instructions are in [`lib/openai.ts`](./lib/openai.ts); agent routing is in `lib/agents/`. Current controls include bounded context, plan/user rate limits, approval states and monitoring. Remaining work is measured first-token latency, provider retry guidance, per-organization budgets, prompt-injection tests and durable worker recovery. Use mocked providers for routine tests. Official reference: [OpenAI production best practices](https://platform.openai.com/docs/guides/production-best-practices).
