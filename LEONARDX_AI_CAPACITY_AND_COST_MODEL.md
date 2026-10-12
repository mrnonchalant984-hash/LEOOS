# LeonardX AI capacity and cost model

Leo requests use the existing OpenAI integration in [`lib/openai.ts`](./lib/openai.ts) and usage records in `ai_usage`. Prompts and private project content must not be copied into monitoring logs.

## Model

For a period, estimate provider cost as:

`requests × (input_tokens × input_price + output_tokens × output_price) + image/tool/provider charges`

Use the provider’s current official pricing and the actual model recorded in `ai_usage`; do not hardcode a price in the application. Add concurrency, timeout and retry counts to the measurement sheet. Retries must not create an unbounded spend loop.

## Controls present / missing

- Present: user rate limits, plan-aware provider buckets in agent execution, bounded request context, operational monitoring and approval states.
- Missing or unverified: complete per-organization budget ledger, provider Retry-After handling across every AI path, measured first-token latency, and provider outage drill.

Routine tests should use a mocked provider. Production cost and capacity remain NOT VERIFIED.
