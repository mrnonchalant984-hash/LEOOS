# Gemini fallback repair (source patch)

## What changed

- `lib/ai/provider-fallback.ts`: emits structured `leo.ai.fallback.start`, `leo.ai.fallback.success`, and `leo.ai.fallback.failure` log events with provider names, reason, status code, and error type only. It never logs prompt content, credentials, headers, or raw provider error messages.
- The fallback helper now skips an unconfigured primary provider and directly tries the configured cross-provider fallback. It treats provider authentication/permission errors (401/403) as eligible for a cross-provider fallback, while still refusing malformed requests (400).
- `lib/ai/model-catalog.ts`: selects `google/gemini-2.5-flash` as the default hosted model when Gemini is configured and OpenAI is not, unless an explicit model setting is provided.
- `tsconfig.json`: excludes temporary `tmp` patch artifacts from compilation.
- `.gitignore`: ignores the root `tmp/` folder.
- `tests/provider-fallback.test.mjs`: adds coverage for direct Gemini-only selection, auth-error fallback, safe fallback logs, and explicit fallback failure.

## Validation performed

- `node --experimental-strip-types --test tests/provider-fallback.test.mjs tests/leo-chat-gemini-integration.test.mjs`: **11 passed, 0 failed**.
- `npm test`: **268 passed, 4 failed, 2 skipped** (full suite is not fully green; four failures need separate investigation).
- `npx tsc --noEmit` and `npm run build`: **not run** because dependencies are not installed in this extracted environment. Install dependencies and run both before deployment.
- No live Gemini API request or Vercel deployment was performed.

## Environment

Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` as a server-side environment variable. Never use a `NEXT_PUBLIC_` key. If you want to explicitly pin fallback, set `LEO_FALLBACK_MODEL=google/gemini-2.5-flash`.
