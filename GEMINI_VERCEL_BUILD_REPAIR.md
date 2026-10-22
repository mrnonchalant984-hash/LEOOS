# Gemini / Vercel build repair

Changes in this patch:

- TypeScript excludes the root `tmp` scratch directory so temporary patch files cannot enter production type-checking.
- The root `tmp/` directory is ignored by Git.
- Leo's default chat and reasoning model now selects `google/gemini-2.5-flash` when a server-side `GEMINI_API_KEY` or `GOOGLE_API_KEY` is configured and neither OpenAI key is configured. Existing explicit model settings and local-model preference are preserved.
- A regression test covers Gemini-only environment configuration.

Keep Gemini credentials server-side in Vercel Project Settings → Environment Variables. Use `GEMINI_API_KEY` (recommended) or `GOOGLE_API_KEY`; do not use a `NEXT_PUBLIC_` variable. Redeploy after changing production environment variables.

Validation performed against the included source tree:

- Provider fallback, chat/Gemini integration, and model-catalog tests: 18 passed.
- Full test suite: 266 passed, 4 failed, 2 skipped. The four failures were test files that exited with code 1 in this environment (`expo-artifact`, `mcp-protocol`, `plugins`, `vercel-deployment-url`); they are not reported as passing.
- `npm run build` and `npx tsc --noEmit` were not run because this extracted archive has no `node_modules` installed. Run them after installing dependencies in the target repository.

This archive is a source patch based on the supplied `LEOOS-main.zip`, not a deployed build. It does not contain API credentials.
