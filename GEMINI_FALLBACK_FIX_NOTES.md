# Gemini fallback quota-handling patch

This patch is based on the previously uploaded `LEOOS-Model-Registry-Gemini-Fix2.zip`.

## Changes
- `lib/ai/provider-fallback.ts`: retry classification now reads `status`, `statusCode`, and nested `response.status`, and recognizes explicit quota/billing/insufficient-credit messages even when an SDK reports an unexpected status shape.
- `tests/provider-fallback.test.mjs`: added regression tests proving OpenAI quota/billing errors trigger the configured Gemini fallback and malformed 400 requests do not.
- `tests/leo-chat-gemini-integration.test.mjs`: corrected stale assertions to match the actual environment catalog and fallback helper. The old test expected `.env.example`, which is not present in this source ZIP.

## Verification
Ran:
`node --experimental-strip-types --test tests/provider-fallback.test.mjs tests/model-provider-registry.test.mjs tests/leo-chat-gemini-integration.test.mjs`
Result: 18 passed, 0 failed.

Not run: full test suite, TypeScript, lint, production build, or live Gemini API request. This does not prove the configured key has usable Gemini API access/quota. Keep the Gemini key server-side in `.env.local`; never use a `NEXT_PUBLIC_` variable for it. Restart `npm run dev` after changing environment variables.
