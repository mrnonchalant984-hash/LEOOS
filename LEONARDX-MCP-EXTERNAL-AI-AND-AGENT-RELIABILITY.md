# LeonardX MCP: external-AI mode and agent execution reliability

## Operating modes

- **Direct Leo AI** — `leo_ai_chat` calls LeonardX's configured provider router. Provider cost/credits and provider availability apply.
- **External-AI-assisted** — `leo_ai_external_assist` returns a clearly labeled task packet for the already-connected MCP client's own model to reason over. It does not call a LeonardX model provider and does not claim to have generated an answer. The client then invokes authorized LeonardX project, build, agent, and deployment tools as appropriate.
- **Hybrid** — the client may reason externally and explicitly call `leo_ai_chat` only for a subtask that should use LeonardX's configured model provider. That call is a distinct paid/provider-backed operation.

The current external-assist tool is intentionally a client-driven delegation primitive, not a server-initiated callback to arbitrary clients. It does **not** persist its packet as a Leo conversation; durable external conversation transcript support remains a separate implementation item. Existing direct `leo_ai_chat` persistence remains owner-scoped.

## Agent execution toggle

The `AGENT_WORKER_ENABLED` feature flag has been removed from the runtime decision path. Agent execution is enabled in application code; access still requires authenticated MCP authorization, account/plan entitlements, approval gates, idempotency, and the protected worker route. The worker still requires `CRON_SECRET` and a trusted scheduler/cron invocation. Removing a feature flag does not create worker infrastructure or make queued jobs run without a scheduler. Configure the existing trusted scheduler to call `GET /api/internal/agents/worker` with `Authorization: Bearer <CRON_SECRET>`; never expose that secret to a client.

## Reliability boundaries

- The isolated runner remains required only for operations dispatched to it; it must not be replaced with shell execution in the Next.js server.
- A provider call, build, deployment, or artifact is successful only when the actual provider/tool confirms it.
- This repository change has not been deployed to production. Production environment, database migrations, worker schedule, and provider credentials must be verified in the target environment.

## Verification

Run `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Integration tests requiring Supabase, provider credentials, runner infrastructure, Vercel/GitHub, Expo, or Godot must be run in a configured staging environment and reported separately from mocked/local tests.

## Update: persisted external-AI conversation workflow

The external-AI workflow now has two MCP tools:

1. `leo_ai_external_assist` accepts a message and optional `session_id`, checks any supplied project against the authenticated account, appends the user message to that account's `chats_v2` history, and returns recent context for the connected client model. It does not call a LeonardX model provider.
2. `leo_ai_external_assist_complete` accepts the same `session_id` and the connected client's actual final response, then persists that response to the same account-owned conversation. It does not independently verify which model produced the supplied response; the protocol is client-driven.

The session is checked against `user_id` on read and write. The client needs `mcp:write` scope to use these state-changing tools. This implementation uses the existing `chats_v2` storage rather than adding a parallel conversation database.

## Verification status for this update

- Focused external-assist persistence and provider-fallback tests: **7 passed**.
- Full test suite: **not clean in this runtime**; 5 test files fail to load/run, including missing dependency/module issues during interrupted package installation. Existing tests also include two skipped checks.
- TypeScript, lint, and production build: **not completed** because the package installation did not finish and the `next` executable was unavailable.
- Live database, real project creation, runner, Android/Godot provider builds, Vercel deployment and production health checks: **not verified** from this environment. These require a complete dependency install and authorized access to the configured production services.
- Agent worker execution still depends on the protected `CRON_SECRET` route being called by the deployment scheduler and on the queue migration being present. Application code cannot create or prove scheduler availability by itself.

## Release verification before pushing

Run `npm ci` first, then `npm run verify` for local typecheck, lint, unit tests, and production build. For the full staging/release gate, run `npm run verify:release` from a terminal where staging-only environment variables are configured. This includes the production configuration preflight, staging health/readiness, external MCP tool smoke test, and runner/Godot service health probes. It deliberately fails when required checks are not configured; it does not print secret values.

Required staging variables include `LEONARDX_STAGING_URL`, `LEONARDX_MCP_URL` (the staging `/mcp` endpoint), `LEONARDX_MCP_ACCESS_TOKEN` (short-lived staging `mcp:read` token), `REPOSITORY_RUNNER_URL`, and `GODOT_BUILD_SERVICE_URL`. Existing `production-preflight.mjs` additionally validates the deployment's required environment configuration. Keep all credentials in the terminal's environment or an untracked local env file; never paste them into chat or commit them.

`npm run verify:release` does not create paid cloud resources or deploy to production. The live checks are read-only. Project creation, real Android/Godot builds, artifact downloads, cross-account authorization, and production deployment must be verified separately in an isolated staging account using disposable test data and actual configured providers. The script reports health checks as health checks, not proof that a complete build pipeline works.
