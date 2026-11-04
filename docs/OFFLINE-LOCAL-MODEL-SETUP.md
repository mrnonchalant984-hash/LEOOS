# Legacy offline local-model setup (disabled)

LeonardX platform inference has been standardized on Google Gemini. Local inference is disabled. The former local OpenAI-compatible inference adapter is retired and this document is retained only to explain why old `LEO_LOCAL_MODEL_URL` settings are ignored. Do not use this procedure for production setup.

For current configuration, set `GEMINI_API_KEY` as a server-side environment variable and use the official Gemini model IDs documented in `lib/ai/model-catalog.ts`. The offline draft/outbox workflow is separate from model inference and remains a local-first draft feature; it does not run a local language model.
