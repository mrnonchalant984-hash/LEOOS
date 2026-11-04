# LeonardX AI Platform Migration Status

Updated: 2026-10-29

## Current provider policy

- Platform text, reasoning, and tool calls use the central Gemini registry in `lib/ai/model-catalog.ts` and `lib/ai/provider-registry.ts`.
- `GEMINI_API_KEY` is the primary server-side credential; `GOOGLE_API_KEY` is accepted as a compatibility alias. Neither belongs in a `NEXT_PUBLIC_` variable.
- Platform OpenAI, Anthropic, and local-model inference paths are disabled. OpenAI/Anthropic customer-owned connection options have been removed from the current customer-connection catalog.
- Image generation/editing uses Gemini image models and private Supabase Storage paths. The default is `gemini-nano-banana-2.1`.
- Public Developer API text inference uses Gemini 3.8 Flash with token-based metering and a dated pricing transition. API model IDs are allowlisted; unknown or legacy model IDs are rejected.

## Workflows not yet production-verified

- Gemini image generation/editing requires a real credentialed request, storage/RLS checks, credit reservation/refund verification, and per-account smoke tests in a non-production environment.
- Realtime/audio routes remain explicitly unavailable until a Gemini Live/TTS/transcription workflow is implemented and tested end-to-end.
- Hosted browser/computer-use agents remain disabled; they must not be reported as operational.
- MCP protocol/authentication, external tool execution, customer-account isolation, Supabase migrations/RLS, Vercel production build/deployment, and webhook/credit settlement still require integration verification with authorized test accounts and configured services.
- The current environment could not complete `npm ci` because npm registry requests failed with DNS `EAI_AGAIN`; therefore full TypeScript, lint, and production build checks could not be run here.

This document records code changes and outstanding verification. It is not a production certification or a claim that external services were tested.
