# LeonardX Gemini fallback repair overlay

## Contents
- `lib/ai/provider-fallback.ts`: normalize status codes from provider SDK errors and wrapped HTTP responses so retryable upstream failures can trigger the configured fallback.
- `tests/provider-fallback-sdk-status.test.mjs`: regression tests for SDK `statusCode`, wrapped `response.status`, and non-retryable 400/401 errors.

## Apply
Extract this ZIP at the root of the existing LeonardX repository and allow it to overwrite `lib/ai/provider-fallback.ts`. Copy the test into the existing `tests/` directory. Do not replace the full application with this overlay.

## Verify
Run:
```bash
node --experimental-strip-types --test tests/provider-fallback.test.mjs tests/provider-fallback-sdk-status.test.mjs
npx tsc --noEmit
npm run lint
npm test
npm run build
```

The targeted fallback tests were run against the supplied source archive: 6 passed, 0 failed. The full typecheck/lint/test/build suite has not been run for this overlay.

## Runtime requirements
The server deployment must have `GEMINI_API_KEY` or `GOOGLE_API_KEY` configured, and the key must have access/quota for `gemini-2.5-flash`. Do not expose these values to the browser. The patch only makes retryable SDK error shapes eligible for fallback; it cannot make an invalid key, exhausted quota, unsupported model, or missing production environment variable work. Redeploy after applying and verify a real request in the server logs.
