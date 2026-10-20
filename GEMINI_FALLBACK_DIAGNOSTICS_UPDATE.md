# Gemini fallback diagnostics update

This update adds safe server-side transition logs in `lib/ai/provider-fallback.ts`:

- `leo.ai.fallback_attempt` confirms that the fallback path was entered and identifies the provider/model selected (never prompts or credentials).
- `leo.ai.fallback_success` confirms the fallback provider returned successfully.
- `leo.ai.fallback_failure` records a sanitized error category and HTTP status when available, then returns an actionable `ModelProviderError` instead of hiding the fact that Gemini failed.

The logs are intended to distinguish “fallback never ran” from “Gemini was called but failed.” They do not prove a live Google API call succeeds. Live Gemini validation requires the developer's local environment and API quota.

Targeted tests run:
`node --experimental-strip-types --test tests/provider-fallback.test.mjs tests/model-provider-registry.test.mjs tests/leo-chat-gemini-integration.test.mjs`

Result: 18 passed, 0 failed. Full TypeScript, lint, full test suite, production build, and live provider request were not run as part of this update.
