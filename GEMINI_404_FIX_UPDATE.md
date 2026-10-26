# Gemini fallback configuration update

LeonardX chat and fallback model selection follows the configured Google AI Studio model ID. Use the currently documented stable text model `gemini-2.5-flash` if it is available to your Google AI Studio project. The app normalizes it internally to the Google provider while keeping the environment value in Google's model-ID format.

- `LEO_CHAT_MODEL=gemini-2.5-flash` selects Gemini for normal chat.
- `LEO_FALLBACK_MODEL=gemini-2.5-flash` selects Gemini when a different primary provider fails with a retryable error.
- Configure `GEMINI_API_KEY` or `GOOGLE_API_KEY` server-side.
- Leave both model settings blank to use automatic provider selection and fallback.

A model ID and API key being configured do not prove that Google's API currently grants that project access; verify the actual response in deployment logs. No live provider call is claimed by this documentation.
