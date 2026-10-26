# Gemini fallback repair

This source archive includes a focused repair to model selection and fallback.

- Unqualified Google AI Studio IDs such as `gemini-2.5-flash` now resolve to the Google provider.
- If Google is configured and OpenAI is not, the default chat model is the Gemini model configured in `LEO_CHAT_MODEL`, or `gemini-2.5-flash` when no Gemini model is specified.
- Cross-provider fallback uses the Gemini model from `LEO_CHAT_MODEL` where available, otherwise `gemini-2.5-flash`.
- Existing fallback start/success/failure logging is retained.
- The provider catalog still contains only its original four entries; no duplicate Gemini preset was added.
- Regression tests cover the unqualified `gemini-2.5-flash` model ID and fallback routing.

Set these Vercel variables (use your exact Google AI Studio model ID):
- `LEO_CHAT_MODEL=gemini-2.5-flash`
- `LEO_FALLBACK_MODEL=gemini-2.5-flash`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` = your valid Google AI Studio API key

Redeploy after updating server-side environment variables. A working key and unit tests do not prove model access, quota, or deployment configuration; verify a real request in staging.
