# LeonardX MCP Gateway Audit

Audit date: 2026-10-19

## Existing implementation

- `/mcp` is an OAuth-protected Streamable HTTP MCP endpoint using the installed MCP SDK. Read and write tools are separated by `mcp:read` and `mcp:write`; project/build handlers bind work to the authenticated user.
- Project tools already create typed projects, read/save source files, run bounded project operations when the isolated runner is deployed, and use the existing GitHub/Vercel deployment flow. Platform owners can separately inspect the LeonardX main repository's GitHub/Vercel state and push explicitly approved file changes to its linked `main` branch.
- Durable engineering workflows, Expo EAS builds, Godot build-service jobs, and the native Android calculator worker already have persisted status and owner-scoped result paths. Android worker availability still depends on external toolchain/scheduler configuration.
- Leo AI already has a provider router supporting configured OpenAI, Anthropic, Google, and local OpenAI-compatible providers. Provider availability is reported from server configuration; no automatic cross-provider fallback is implemented.
- Specialist agents already have a static runtime registry, plan/owner entitlement checks, durable `agent_runs`/`agent_jobs`, and a protected worker. Developer Agent Studio has a separate owner-scoped custom-agent table and paid API-credit reservation flow.

## Added in this change

- `leo_ai_chat` uses the existing provider router, persists user-owned conversation turns in `chats_v2`, verifies optional project ownership before adding source context, and deduplicates provider requests using user-scoped idempotency records.
- `list_ai_providers` reports configured provider/model availability without exposing credentials.
- Agent discovery, invocation, run history/status, queued cancellation, and approval tools reuse the runtime registry, existing entitlement checks, approval records, and durable worker.
- Account-owned Developer Agent Studio agents are discoverable and invocable only by their owner with an active Developer plan and the existing verified OpenAI usage-credit reservation. Attached tools are revalidated and remain read-only.
- Owner-managed registry writes are restricted to `mcp_text_only` agents with no tool grants, arbitrary code, shell, database, or deployment privileges. They are disabled on creation and owner-only at discovery/invocation.

## Verified boundaries

- No MCP Resources or Prompts are currently registered; the implementation uses tools and Streamable HTTP.
- The static built-in agent registry remains code-defined. The owner database registry is supported only for explicitly tagged text-only agents; database records do not automatically become executable agents.
- The owner main-website push is restricted to the configured repository and Vercel project, requires the latest inspected commit SHA and `confirm=true`, uses only the owner's verified GitHub/Vercel integrations, and refuses GitHub workflow, environment-secret, and credential files. GitHub branch protection and Vercel's Git integration remain authoritative.
- Workforce monitoring, team, and queue pages refresh only while visible. On-demand workforce task execution is owner-authenticated; the existing Vercel Hobby cron schedules remain daily instead of exceeding Hobby's cron cadence.
- This audit does not claim a production deployment or a successful live Leo/provider invocation unless separately verified with a real MCP token and provider call.
- Leo MCP execution uses the shared provider router and configured Gemini fallback where eligible; provider failures remain explicit and are not presented as successful responses.
