# LeonardX repair change summary

This archive contains targeted, partial repairs based on the uploaded source ZIP. It is not a claim that the complete production repair mission has passed.

## Changes made

- `lib/ai/model-catalog.ts`: the centralized model registry advertises only Gemini; OpenAI, Anthropic, and local model IDs are rejected by model resolution; non-Gemini providers are treated as unconfigured; retired model aliases are no longer silently rewritten to a different model.
- `lib/openai.ts`: the Leo system prompt now explicitly says that a user's chat message or claimed name must not establish owner identity. Owner greetings must rely on trusted server-supplied authorization context.
- `app/api/chat/route.ts`: model-configuration errors direct users to the Gemini server configuration rather than suggesting arbitrary providers.
- `.env.example`: legacy provider variables are marked as legacy and commented out; Gemini's canonical key is `GEMINI_API_KEY`.
- `tests/model-provider-registry.test.mjs`: added/updated assertions for Gemini-only model resolution and for OpenAI credentials not enabling a model provider.

## Known limitations

The codebase still contains direct OpenAI/Anthropic paths in multiple routes and services (including realtime sessions, the v1 messages API, hosted browser agents, integration checks, and some administrative/meeting flows). Those paths have **not** all been migrated or disabled in this partial delivery. Do not deploy this archive as proof of a complete Gemini-only migration.
