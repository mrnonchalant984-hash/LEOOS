# AI Platform Implementation Plan — Gemini-only

Updated 2026-10-29. This replaces the earlier multi-provider plan.

## Target architecture

- Use `@google/genai` behind `lib/ai/model-catalog.ts` and `lib/ai/provider-registry.ts` for platform text generation and tool calling.
- Use `GEMINI_API_KEY` as the server-side key; `GOOGLE_API_KEY` remains a compatibility alias.
- Use dedicated Gemini image model IDs for image generation/editing and verify model capability before enabling a workflow.
- Do not route platform inference to OpenAI, Anthropic, or local-model endpoints.
- Do not advertise hosted browser/computer-use, live audio, or research/search capabilities as operational until their Gemini-backed workflows and authorization boundaries are implemented and verified.
- Public Developer API metering must use measured Gemini token usage and the reviewed Gemini pricing catalog; unsupported models must be rejected before provider invocation.

## Release gates

1. `npm ci`, typecheck, lint, and the entire test suite pass in CI.
2. A production build completes with the same lockfile and runtime as deployment.
3. Gemini text/tool, image create/edit, and Developer API flows pass with non-production credentials.
4. Credit reservation, settlement/refund, duplicate request handling, and private asset persistence pass with a staging database.
5. MCP authentication, account isolation, tool approval, agent persistence, and owner-only workflows pass with separate test accounts.
6. Audio/live/research/browser capabilities remain explicitly unavailable until each has an end-to-end verified implementation.
7. Production deployment is performed only after all release gates pass and the owner approves the release.

No release gate is considered complete based on static source inspection alone.
