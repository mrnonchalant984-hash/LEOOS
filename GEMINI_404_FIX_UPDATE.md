# Gemini fallback model update

## Change

The automatic and documented Gemini fallback has been updated from `gemini-2.5-flash` to `gemini-3.8-flash`. Google's current Gemini API model documentation identifies Gemini 2.5 models as restricted for new projects and recommends newer Flash models; a 404 on the old model can mean that model is unavailable to the API key/project. This is a compatibility update, not proof that the configured key has access.

Fallback diagnostics now classify HTTP 404 as `model_or_endpoint_not_found_or_unavailable` and include `failure_stage: provider_request`. Raw provider error messages, prompts, and credentials are deliberately not logged.

## Environment

- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) must be set server-side.
- Optional: `LEO_FALLBACK_MODEL=google/gemini-3.8-flash`.
- Optional for using Gemini as the primary chat model: `LEO_CHAT_MODEL=google/gemini-3.8-flash`.

Restart the local server after changing environment variables. Do not place keys in `NEXT_PUBLIC_*` variables or commit `.env.local`.

## Validation limits

This update changes the registered fallback model and deterministic tests. A real Gemini request still must be smoke-tested with the user's API key; availability, free-tier quota, project access, and region can affect results. No live request is claimed here.
