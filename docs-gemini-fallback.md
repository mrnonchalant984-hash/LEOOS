# Leo AI: free-tier Gemini model routing

Leo's built-in text agents use the Gemini Developer API free tier. The server accepts only the free-tier model IDs listed below; paid-only model IDs in old environment variables are ignored or rejected.

## Free-tier model routing

- General chat, coding agents, and ordinary specialist work: `gemini-3.5-flash-lite`.
- Research and Deep Research: `gemini-2.5-flash-lite`, because its free tier supports Google Search grounding (subject to Google's published request quota).
- Audio transcription: `gemini-2.5-flash-lite` or `gemini-3.5-flash-lite`.
- Text-to-speech: `gemini-2.5-flash-preview-tts`.

Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) only in server-side environment variables. `LEO_CHAT_MODEL`, `LEO_REASONING_MODEL`, `LEO_AGENT_MODEL`, and `LEO_FALLBACK_MODEL` are accepted only when they resolve to a model in the free-tier catalog. A global `LEO_AGENT_MODEL` no longer overrides every specialist.

Google Search grounding on Gemini 2.5 Flash-Lite has a free-tier quota; it is not unlimited. If that quota is exhausted, Research should return a clear provider/quota error rather than silently switch to a paid model.

Image generation uses a separate image-capable Gemini model and is not covered by this text-agent free-tier routing. Do not assume that a text model can generate images or that an image model is included in the free API tier.

## Deploy and verify

1. Confirm the server-side Google API key is configured.
2. Keep `LEO_CHAT_MODEL` blank for automatic free-tier selection, or set it to `gemini-3.5-flash-lite`.
3. Keep `LEO_REASONING_MODEL` and `LEO_AGENT_MODEL` blank unless setting a supported free-tier model.
4. Test ordinary chat, a coding specialist, Research, and Deep Research.
5. Confirm the execution telemetry reports `google/gemini-3.5-flash-lite` for general agents and `google/gemini-2.5-flash-lite` for research.
6. Check the Google AI Studio usage dashboard for the actual key quota and requests.

A configured key and passing unit tests do not prove live provider access. Verify with the actual deployed key without exposing it in logs or chat.
