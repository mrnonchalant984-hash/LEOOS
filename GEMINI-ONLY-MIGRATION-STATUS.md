# LeonardX Gemini-only migration status

Updated: 2026-10-29

## Changes in this repair pass

- Made the model provider type and execution registry Gemini-only, accepted `GEMINI_API_KEY` or the compatibility alias `GOOGLE_API_KEY`, and added a strict allowlist for supported Gemini text model IDs.
- Removed the OpenAI and Anthropic SDK dependencies from `package.json` and synchronized the package-lock root dependency list.
- Renamed the former `lib/openai.ts` system-prompt/config helper to `lib/leo-system-prompt.ts` and updated imports.
- Updated builder readiness, readiness probe, integration status, environment catalog, integration UI, MCP provider discovery, workforce worker/conversation/meeting checks, and production preflight to use Gemini rather than OpenAI/local inference.
- Changed image generation/edit defaults to the Gemini image model `gemini-nano-banana-2.1` and added recognition for Nano Banana model IDs.
- Migrated the public Developer API text route to `@google/genai`, including Gemini streaming, measured usage metadata, reservation/settlement, bounded input/output, request validation, usage logging, and webhooks. Migrated API model discovery and pricing to Gemini 3.8 Flash with a dated price change on 2027-01-01.
- Removed customer connection choices and live credential checks for OpenAI/Anthropic; Gemini remains available as the platform/customer integration provider.
- Disabled the browser-agent UI affordance and explicitly marked realtime audio and research execution unavailable until Gemini-backed implementations are verified.
- Updated outdated tests and docs to match the current Gemini-only policy.

## Verification

- Focused regression suite: **85 passed, 0 failed**.
- Full repository suite: **288 tests; 282 passed, 4 failed, 2 skipped**. The four failures are test-file imports blocked by incomplete dependencies, not assertion failures:
  - `tests/expo-artifact.test.mjs` (missing package import)
  - `tests/mcp-protocol.test.mjs` (missing `@modelcontextprotocol/sdk/client/index.js`)
  - `tests/plugins.test.mjs` (missing package import)
  - `tests/vercel-deployment-url.test.mjs` (missing package import)
- `node --experimental-strip-types --check` passed for the changed TypeScript route/library files.
- Global `tsc --noEmit` could not typecheck because required type definitions are absent from `node_modules`.
- `npm ci` could not complete: npm registry requests failed with DNS `EAI_AGAIN`. Consequently ESLint and `next build` could not be run.

## Not certified production-ready

No production push, deployment, database migration, or production data mutation was performed. Live Gemini calls, image storage/credit accounting, streaming billing settlement, Supabase RLS and cross-account isolation, authenticated MCP/OAuth flows, background worker recovery, and deployment smoke tests still require a staging environment with valid test credentials. Realtime audio, browser/computer-use, and research/search routes remain unavailable rather than falsely reported as working.

This is an updated source package with verified static/regression work, not a production release certification.
