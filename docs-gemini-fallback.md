# Leo AI: Gemini provider and automatic fallback

Leo AI already uses the shared provider registry, which passes the full server-built Leo system prompt and the most recent conversation history to supported providers. Gemini is configured server-side; never expose its API key to browser code.

## Configure

Set these variables in your deployment platform's server-side environment settings:

- `GEMINI_API_KEY`: API key created in Google AI Studio. `GOOGLE_API_KEY` is accepted as an alternative for compatibility.
- `LEO_CHAT_MODEL=gemini-3.8-flash` to make Gemini the normal chat model.
- `LEO_FALLBACK_MODEL` to select a configured cross-provider fallback. Setting it to another Gemini model will not provide a fallback when Gemini itself is the primary provider.
- `LEO_GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1`, `LEO_GEMINI_AUDIO_MODEL=gemini-3.5-transcribe`, and `LEO_GEMINI_TTS_MODEL=gemini-3.8-flash-tts` for the current image, transcription, and speech models.

Leave both chat and fallback model variables blank to use automatic provider selection: Gemini is selected as the primary only when Google is configured and OpenAI is not. When Gemini is primary, an explicitly configured fallback must use another provider and that provider must have usable access and quota. Leo retries once with the configured cross-provider fallback for HTTP 401/403, 404, 408, 409, 429, 5xx, and recognized transient network failures. Invalid requests and other non-retryable errors do not trigger fallback. Paid custom-agent requests remain on their provider-priced OpenAI model and do not cross-provider fallback, keeping usage settlement tied to the rated model. Tool mode retains the account-scoped read-only tool allowlist.

Google AI Studio free-tier availability, quotas, supported models, and regional eligibility can change; fallback is not guaranteed to succeed if the Google account has exhausted quota or the model is unavailable. No provider key is included in this repository.

## Deploy and verify

1. Add the key and model variables in the server deployment environment; do not add them to `NEXT_PUBLIC_*` variables or commit them to Git.
2. Redeploy the app so the server process receives the variables.
3. Open Leo AI and test a greeting (for example, `Hi Leo, introduce yourself`), a LeonardX capability question, and a follow-up that refers to the previous message.
4. To verify fallback, temporarily use an intentionally unavailable primary model only in a staging deployment and confirm a successful Gemini reply plus provider/model telemetry. Do not test by breaking production credentials.
5. Check server-side AI usage/monitoring and confirm the provider is recorded as `google` after a fallback. A configured key and passing unit tests do not prove a live provider request; test with the actual deployed key.

## Validation

Run `npm ci`, then `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Keep all real `.env` files and deployment secrets out of release archives.
