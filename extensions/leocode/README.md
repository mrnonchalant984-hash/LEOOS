# Bram Code for Visual Studio Code

Bram Code is Braverton's independent AI coding model integration for VS Code. It registers a first-party model provider through VS Code's Language Model Chat Provider API, so Bram Code can be selected from the VS Code Chat model picker. Inference for that provider is sent directly to Braverton's metered Developer API. It does not use GitHub Copilot as the inference provider and does not consume Copilot model billing.

## Connect the independent model

1. Sign in to your Braverton account at the Braverton site.
2. Open the Developer API keys page at `/api-keys`.
3. Create a key with the `write` scope (the API treats write as sufficient for read-only model discovery too).
4. Activate an API plan with available credits.
5. In VS Code, run **Bram Code: Configure Braverton API** and paste the key. It is stored in VS Code `SecretStorage`, never in settings or source files.
6. Open VS Code Chat and select **Bram Code** from the model picker.

The provider discovers the model catalogue from `GET /api/v1/models` and sends inference to `POST /api/v1/messages`. The server validates the API key, plan, rate limit and available credits, then records billable usage. A valid key alone does not include free inference: requests require an active plan and sufficient credits. Revoke the key from the Braverton dashboard if the device is lost.

The model provider currently supports text conversations and streaming text responses. It does not yet expose tool calling, image input, autonomous agent mode, or direct file-write tools in VS Code Chat. These capabilities are not claimed as complete.

## Inline editor completions

Bram Code can provide ghost-text code suggestions that users accept with Tab.

- Enable **Bram Code: Toggle Inline Completions** or set `leocode.inlineCompletions.enabled` to `true`.
- Inline requests use the same Braverton Developer API key and are metered against the account's API plan.
- Requests are throttled (default minimum interval: 1,200 ms).
- Only the nearby code context is sent: up to 6,000 characters before and 1,600 after the cursor.
- Context is redacted with the extension's workspace secret-redaction rules. Credential files, excluded directories and paths through symbolic links are not sent.
- Inline completions are opt-in and disabled by default to avoid unexpected API usage.

## Workspace and code-review features

The extension also includes a separate Bram Code activity-bar workspace view. This view currently uses the authenticated Braverton account chat API (`/api/chat`) and its existing account entitlements; it is separate from the independent model-picker provider and does not use the Developer API key for inference.

The workspace view and extension host provide:
- Explicitly selected active-file/selection context and bounded safe-file context sharing.
- Local workspace search and project inventory.
- Multi-file code proposals with VS Code diff previews, explicit approval before applying, and stale-file checks.
- Code explanation, code generation, test generation and review prompts.
- **Bram Code: Edit Selected Code**: send a selected, safe code region to the metered Developer API, inspect a VS Code diff, and explicitly approve before the extension writes the replacement.
- A local Code Review Centre for files, selections, workspace inventory and Git changes.
- User-approved test/lint/typecheck/build operations where a configured hosted workspace is available.
- Braverton-connected MCP discovery and approved tool calls through the existing server authorization boundary.

The model-picker provider itself is not an autonomous agent. It currently has tool calling disabled. File proposals and review/apply operations remain separate extension-host features and require user confirmation. The selected-code edit command is a single user-initiated request, not an autonomous agent loop.

## Security and privacy

- Developer API keys are stored in VS Code `SecretStorage`; never commit them or paste them into project files.
- Inline completions are disabled by default. When enabled, bounded nearby code context is sent to Braverton and billed by the Developer API.
- Common credential paths are excluded, symbolic-link paths are rejected, and common secret assignments are redacted. Redaction is best-effort, not a guarantee that every secret can be detected.
- The extension does not automatically upload the entire workspace.
- Proposed file changes are shown as diffs and require explicit user approval.
- User-approved shell commands run with the local user's OS permissions. Approval is not an operating-system sandbox.

## Development

1. From this directory, run `npm ci`.
2. Run `npm test` to compile and execute extension tests.
3. Run `npm run compile` to compile the extension.
4. Open this directory in VS Code and press F5 to launch the Extension Development Host.

The default server origin is `https://leoos-omega.vercel.app`. A local development origin can be configured through `leocode.baseUrl`; non-local HTTP origins are rejected.

## Marketplace

- Extension ID: `leonardx.leocode`
- Publisher ID: `leonardx`
- Display name: **Bram Code by Braverton**

Install from the VS Code Extensions view by searching for **Bram Code by Braverton**, or run `code --install-extension leonardx.leocode`.
