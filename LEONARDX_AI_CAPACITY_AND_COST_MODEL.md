# LeonardX AI Capacity and Cost Model

Date: 2026-10-12

## Status summary

- VERIFIED WITH EVIDENCE: the repo uses OpenAI server-side via [lib/openai.ts](lib/openai.ts), and AI features are structured under app routes.
- PARTIAL: no real provider quota, token usage, or cost data was measured in this environment.
- BLOCKED: provider rate limits, cost per model, concurrency ceilings, and real token usage require live credentials and configured provider instrumentation.

## Observed architecture

AI-related routes include:

- [app/api/chat/route.ts](app/api/chat/route.ts)
- [app/api/research/route.ts](app/api/research/route.ts)
- [app/api/speak/route.ts](app/api/speak/route.ts)
- [app/api/voice/route.ts](app/api/voice/route.ts)
- [app/api/generate-image/route.ts](app/api/generate-image/route.ts)
- [app/api/admin/leo/training/test/route.ts](app/api/admin/leo/training/test/route.ts)

## AI risk points

- provider quotas are constrained by environment config, but not measured here
- no real concurrency budget is enforced in repo-level code for all routes
- no per-user AI cost model is documented from actual traffic and rate plans
- retries risk compounding cost during provider failures

## Recommended guardrails

- enforce per-user and per-tenant concurrency caps
- set per-request timeout and total token ceilings
- apply exponential backoff with jitter on rate limit and timeout retries
- keep mock-provider load tests by default
- cap total daily spend for each workspace or user with config-driven limits
- require server-side authorization before any tool or model side effect

## Illustrative capacity model

This is a planning model, not verified production capacity.

| Scenario | Assumption | Estimated cost pattern |
|---|---|---|
| Light product usage | 50 active users, few chat requests/day | low, stable |
| Moderate usage | 500 active users, chat + simple generation | moderate, provider-dependent |
| High usage | multiple concurrent AI tasks, rich generation | provider throttling risk, cost spikes |

## Cost drivers

- input/output token count
- image generation model and output size
- audio transcription/speech calls
- concurrency and retries
- model selection and fallback behavior

## Evidence status

- VERIFIED WITH EVIDENCE: OpenAI integration exists and the repo compiles.
- PARTIAL: cost model is not validated with real provider data.
- BLOCKED: accurate token/cost quotas need real provider access and billing configuration.
