# Leo AI: Gemini provider and automatic fallback

Leo AI already uses the shared provider registry, which passes the full server-built Leo system prompt and the most recent conversation history to supported providers. Gemini is configured server-side; never expose its API key to browser code.

## Configure

Set these variables in your deployment platform's server-side environment settings:

- `GEMINI_API_KEY`: API key created in Google AI Studio. `GOOGLE_API_KEY` is accepted as an alternative for compatibility.
- `LEO_CHAT_MODEL=google/gemini-2.5-flash` to make Gemini the normal chat model, if that model is available to your key.
- `LEO_FALLBACK_MODEL=google/gemini-2.5-flash` to explicitly select Gemini as the fallback. If this is blank, the app automatically uses Gemini Flash as fallback only when a Google key is configured and the selected primary provider is OpenAI.

The default primary model remains the existing configured Leo model. When its request fails with HTTP 429, HTTP 5xx, or a recognized transient network failure, Leo retries once using the configured fallback model. Authentication, invalid-request, and other non-transient errors do not trigger fallback. Custom developer-agent requests retain their OpenAI-only rated billing path and do not fall back to a differently priced provider. Tool mode retains the account-scoped read-only tool allowlist.

Google AI Studio free-tier availability, quotas, supported models, and regional eligibility can change; fallback is not guaranteed to succeed if the Google account has exhausted quota or the model is unavailable. No provider key is included in this repository.

## Deploy and verify

1. Add the key and model variables in the server deployment environment; do not add them to `NEXT_PUBLIC_*` variables or commit them to Git.
2. Redeploy the app so the server process receives the variables.
3. Open Leo AI and test a greeting (for example, `Hi Leo, introduce yourself`), a LeonardX capability question, and a follow-up that refers to the previous message.
4. To verify fallback, temporarily use an intentionally unavailable primary model only in a staging deployment and confirm a successful Gemini reply plus provider/model telemetry. Do not test by breaking production credentials.
5. Check server-side AI usage/monitoring and confirm the provider is recorded as `google` after a fallback. A configured key and passing unit tests do not prove a live provider request; test with the actual deployed key.

## Validation

Run `npm ci`, then `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Keep all real `.env` files and deployment secrets out of release archives.
