# LeonardX Minimal-Diff Build and Regression Repair Report

## Scope
This archive is the existing LeonardX source tree with targeted changes only. No GitHub push or Vercel deployment was performed. No live Gemini API request was made.

## Files changed
- `components/AIProviderStatus.tsx` — starts with loading state already set, uses a stable callback, aborts stale requests on refresh/unmount, ignores aborted results, and preserves visible loading/error/status behavior. No lint suppression added.
- `lib/ai/model-catalog.ts` — registers `gemini-1.5-flash` as the configured Google text model and normalizes unqualified Google AI Studio model IDs internally for the provider router.
- `lib/ai/provider-fallback.ts` — chooses the configured Gemini text model (or `gemini-1.5-flash` default) for eligible cross-provider fallback, ignores stale fallback configuration when ordinary chat has another eligible fallback, avoids same-provider automatic fallback for Google primaries, and normalizes unqualified fallback IDs before sending them to the router. Logs retain metadata only.
- `tests/leo-chat-gemini-integration.test.mjs` — expects the intended Gemini 1.5 fallback model and preserves assertions for system prompt/history and server-only credentials.
- `tests/one-click-gemini-upgrade.test.mjs` — aligns supported model and environment selection with unqualified `gemini-1.5-flash`.
- `tests/provider-fallback.test.mjs` — validates Gemini 1.5 fallback selection and normalized model routing.
- `tests/model-provider-registry.test.mjs` — removes a duplicate unqualified-model assertion introduced in an earlier patch; retains registry/security/default checks.
- `.env.example` — documents unqualified model IDs and server-side key requirements.
- `docs-gemini-fallback.md`, `GEMINI-FALLBACK-REPAIR-REPORT.md`, `GEMINI_404_FIX_UPDATE.md`, `AI-PROVIDER-OVERLAY-REPORT.md` — correct stale text-fallback model references and describe configuration accurately.

## Root causes addressed
1. The chat and fallback implementation had mixed stale Gemini 2.5 text-model assumptions with the requested `gemini-1.5-flash` environment value. Some tests/docs expected the stale model while the implementation selected 1.5.
2. The unconfigured-primary branch passed a valid unqualified fallback straight through to the generation callback instead of normalizing it to the internal provider/model form. This made a valid `gemini-1.5-flash` fallback behave differently depending on which fallback path was taken.
3. `AIProviderStatus` called its state-setting loader directly inside an effect. The updated component initializes loading state up front and performs asynchronous updates after the request resolves, with `AbortController` cleanup for refresh/unmount.

## Validation results in this environment
- Focused regression suite: **29 passed, 0 failed, 0 skipped** (`provider-fallback`, chat Gemini integration, one-click Gemini upgrade, model-provider registry).
- Full `npm test`: **268 passed, 4 failed, 2 skipped**. The four failures are test files that could not load missing third-party packages because dependency installation could not complete: `tests/expo-artifact.test.mjs`, `tests/mcp-protocol.test.mjs`, `tests/plugins.test.mjs`, and `tests/vercel-deployment-url.test.mjs`. npm registry requests failed with `EAI_AGAIN`; this is an environment/dependency-install blocker, not a passing full test suite.
- `npx tsc --noEmit`: **not passed**. It exited 2 because the interrupted/partial install left missing TypeScript type definitions, including `react-reconciler`, `retry`, `stats.js`, `three`, and `webxr`.
- `npm run lint`: **not run successfully**; exited 127 because `eslint` was unavailable after dependency installation failed.
- `npm run build`: **not run successfully**; exited 127 because `next` was unavailable after dependency installation failed.
- ZIP integrity: verified after creation.

## Remaining requirements
Run `npm ci` in a network-enabled environment, then rerun exactly `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`. Before deployment, configure `GEMINI_API_KEY` or `GOOGLE_API_KEY` as a server-only variable, and set `LEO_CHAT_MODEL=gemini-1.5-flash` and `LEO_FALLBACK_MODEL=gemini-1.5-flash` as unqualified Google AI Studio model IDs. Verify a real deployed fallback request in logs; unit tests do not prove the key's quota or model access.
