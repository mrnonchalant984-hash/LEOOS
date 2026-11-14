# LeoCode AHP Host Implementation — Work-in-Progress Report

**Date:** 2026-11-13
**Target repository:** `mrnonchalant984-hash/LEOOS`
**Baseline:** `LEOCODE-native-agent-update.zip`, verified against the current GitHub main-branch blobs for the existing LeoCode manifest, extension entrypoint, API client, README, chat route, and model catalog.
**Status:** Local implementation present. Start/stop commands and dependency declarations are included, the extension lockfile is updated, the TypeScript compile passes, and all 24 LeoCode tests pass. Live host validation and feature-parity work remain pending.

## Implemented in the local working copy

1. Added a local AHP host manager using `@ahpd/sdk` and `@ahpd/agent-cofold` `0.14.0`.
   - Binds only to `127.0.0.1`.
   - Generates a random connection token per start.
   - Keeps the LeonardX access token in VS Code `SecretStorage`; the Gemini key remains server-side.
   - Uses the first open workspace folder.
   - Stores CoFold session data in VS Code extension global storage.
2. Added LeoCode start/stop commands for the loopback AHP listener. The host URL is copied to the clipboard when it starts.
3. Added a server-side OpenAI-compatible Gemini proxy at `/api/leocode/agent/v1/chat/completions`.
   - Requires an authenticated LeonardX account.
   - Uses the server-controlled Gemini model selected by `LEO_CHAT_MODEL` / the model registry.
   - Keeps `GEMINI_API_KEY` / `GOOGLE_API_KEY` on the server.
   - Includes the Leo system prompt, authenticated owner context, active user-approved memories, and relevant Leo knowledge.
   - Enforces the existing LeoCode daily entitlement quota and a separate request rate limit.
   - Records provider usage when Gemini returns usage metadata.
4. Added `/api/leocode/agent/v1/models` so the local AHP backend discovers the server-selected model instead of hardcoding a model choice.
5. Enabled local file and shell capabilities through CoFold. File writes and shell calls require AHP policy approval; read-only inspection is allowed. Obvious Git publishing/deployment command patterns and network/MCP tools are denied in this first bridge.
6. Added source-level regression tests and documented the limitations.
7. Simplified a pre-existing deeply nested Git extension type in `extensions/leocode/src/review/engine.ts` after the baseline TypeScript parser rejected it.

## Critical native Agents-window limitation

This implementation does **not** yet register Leo as a native harness alongside Copilot, Claude, and Codex in the dedicated Agents window.

Microsoft's current documentation says the dedicated Agents window connects to VS Code-managed Agent Hosts through supported local, SSH, Dev Tunnels, WSL, and GitHub-environment routes. The public `chat.workspaceRemoteAgentHosts` setting is documented for custom WebSocket Agent Hosts in the **Chat view**, not as a general third-party harness registration API for the dedicated Agents window.

The AHP server is a real protocol host, but protocol compatibility alone does not grant a third-party extension a supported registration path into the Agents-window harness picker. A supported VS Code adapter/registration mechanism or a separately validated VS Code-managed host integration is still required.

## Blockers and unverified work

- **GitHub write access:** Creating the feature branch `feat/leocode-ahp-native-agent-host` was rejected by the connected GitHub integration with HTTP 403 `Resource not accessible by integration`. No repository write was attempted on `main`. This report and patch are local artifacts only.
- **Live host validation:** A full compile is successful, but an Extension Development Host launch, VSIX package, and live AHP WebSocket handshake have not been performed.
- **Tests:** All 24 LeoCode source tests pass. They do not replace an Extension Development Host test or a live Gemini request.
- **Runtime boundary:** The initial listener runs inside the LeoCode extension host process, not a separate persistent host process. Active turns can stop if that process exits. A dedicated process is needed for robust persistence and isolation.
- **Parity gaps:** The initial host exposes one Leo agent. It does not yet dynamically expose the account's specialist-agent registry, the existing LeonardX MCP connections, the full web/browser tools, all main-chat project/account context, or full chat-history synchronization to `chats_v2`. MCP/network tools are intentionally disabled until their authorization bridge is designed and tested.
- **Security verification:** The AHP approval policy and local tool behaviour have not been exercised against a live VS Code client. Shell commands still run with the local user's operating-system permissions after approval; this is not an OS sandbox. Do not enable automatic approval for this host.
- **Deployment:** No Vercel deployment, Marketplace release, Git commit, or push was performed.

## Verification performed

- TypeScript syntax transpilation: **5 files passed**.
- Focused source tests: **12 passed, 0 failed**.
- GitHub source-baseline comparison: existing key source files matched current main-branch blob hashes before local edits.
- LeoCode compile: **passed**. LeoCode tests: **24 passed, 0 failed**. Live VS Code connection, live Gemini tool execution, VSIX packaging, and staging verification: **not completed**.

## Files changed

- `app/api/leocode/agent/v1/chat/completions/route.ts` (new)
- `app/api/leocode/agent/v1/models/route.ts` (new)
- `extensions/leocode/src/ahp/host.ts` (new)
- `extensions/leocode/src/api/client.ts`
- `extensions/leocode/src/extension.ts`
- `extensions/leocode/src/review/engine.ts`
- `extensions/leocode/package.json`
- `extensions/leocode/README.md`
- `extensions/leocode/CHANGELOG.md`
- `extensions/leocode/test/ahp-host.test.cjs` (new)

`extensions/leocode/package-lock.json` requires regeneration and is intentionally not included in the patch.
