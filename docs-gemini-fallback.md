# Leo AI: free-tier Gemini model routing

Leo's built-in text agents use the Gemini Developer API free tier. The server accepts only the free-tier model IDs listed below; paid-only model IDs in old environment variables are ignored or rejected.

## Free-tier model routing

- General chat, coding agents, and ordinary specialist work: `gemini-3.1-flash-lite`.
- Research and Deep Research synthesis: `gemini-3.1-flash-lite`. Web search is handled separately through Tavily using `TAVILY_API_KEY`; its free Researcher tier includes 1,000 credits/month without a card and stops without charges unless pay-as-you-go is explicitly enabled.
- Audio transcription: `gemini-2.5-flash` or `gemini-3.1-flash-lite`.
- Text-to-speech: `gemini-2.5-flash-preview-tts`.

Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) only in server-side environment variables. `LEO_CHAT_MODEL`, `LEO_REASONING_MODEL`, `LEO_AGENT_MODEL`, and `LEO_FALLBACK_MODEL` are accepted only when they resolve to a model in the free-tier catalog. A global `LEO_AGENT_MODEL` no longer overrides every specialist.

Research uses a separate web-search provider and Gemini only for synthesis. If Tavily is not configured or its free allowance/rate limit is reached, Research must fail clearly; it must not silently fall back to paid Google Search grounding or another paid provider.

Image generation uses a separate image-capable Gemini model and is not covered by this text-agent free-tier routing. Do not assume that a text model can generate images or that an image model is included in the free API tier.

## Credential, model-access, and quota checks

- Owner-only diagnostic endpoint: `GET /api/models/health`. It sends the production server-side key to Google's model-metadata API in an authorization header, never returns or logs the key, and checks each catalog model's `generateContent` support.
- This metadata check verifies that Google accepts the credential and that the model is accessible. It does not run inference or consume model tokens.
- Google does not expose remaining per-model Gemini Developer API quota through this metadata endpoint. The runtime reports quota evidence separately from actual generation: a successful generation means quota was available at that time; HTTP 429 means a rate or quota limit. Do not label remaining quota as known when it is not exposed.
- The model registry distinguishes `credential_present` from `operational`. A model is operational only after a real generation succeeds; merely finding a key in Vercel is not a health check.
- Authentication/permission failures (401/403) and model-not-found failures (404) are surfaced directly, not hidden by fallback. Only transient errors and rate/quota errors can trigger one alternate Gemini attempt.

## Deploy and verify

1. Confirm the server-side Google API key is configured.
2. Keep `LEO_CHAT_MODEL` blank for automatic free-tier selection, or set it to `gemini-3.1-flash-lite`.
3. Keep `LEO_REASONING_MODEL` and `LEO_AGENT_MODEL` blank unless setting a supported free-tier model.
4. Test ordinary chat, a coding specialist, Research, and Deep Research.
5. Confirm the execution telemetry reports `google/gemini-3.1-flash-lite` for general agents and `google/gemini-2.5-flash` for research.
6. Set `TAVILY_API_KEY` in the server environment to enable query-based web search. Direct-URL research can still crawl supplied public URLs without Tavily.
7. Check the Tavily dashboard for usage. Do not enable pay-as-you-go if the deployment must remain free.

A configured key and passing unit tests do not prove live provider access. After deployment, call `/api/models/health` as the authenticated owner to verify the actual production key and per-model access without exposing the key. Quota remaining is not available from the metadata API; use real generation responses to distinguish success from HTTP 429.
