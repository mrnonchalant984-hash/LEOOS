# AI platform implementation plan

## Milestone 1 — Creative vertical slice (implemented; release verification incomplete)

- Reuse the authenticated LeonardX shell and existing private storage, image/video providers, job history, and credit controls.
- Expose configured text-to-image, validated image-edit, and text-to-video workflows only.
- Persist source and output media separately, show truthful job states, and provide private history/downloads.
- Validate with upload tests, project tests, type checking, linting, and a production build where the build pipeline completes.

## Milestone 2 — Provider-neutral model layer

- Define typed provider/model capability contracts and a server-only registry.
- Add accurate configured/unconfigured status without exposing credential values.
- Wrap OpenAI text first, then add official Anthropic and Google SDK adapters only after environment, request, streaming, tool-call, and error contracts are established.
- Preserve current chat behavior; add explicit model selection and bounded, visible fallback policy.
- Record usage only when provider responses actually report it; do not invent prices.

## Milestone 3 — Secure outbound MCP

- Select the official MCP SDK and transports supported by the hosting/runtime.
- Store server registrations and per-user/per-tool grants securely; require review before enabling newly discovered tools.
- Restrict outbound destinations and redirects, block private/link-local addresses, defend against DNS rebinding and SSRF, and prevent credential forwarding.
- Validate tool input schemas, enforce timeouts/rate limits, record redacted execution metadata, and gate consequential writes.

## Milestone 4 — Inbound MCP and orchestration

- Evaluate stateless Streamable HTTP for the Vercel deployment. Confirm protocol/version behavior before exposing an endpoint.
- Implement real authentication, scopes, user resolution, per-tool authorization, ownership checks, and revocation. Do not label existing bearer/session handling OAuth.
- Reuse the existing workforce job model with a bounded execution plan, limited delegation/retries, cancellation, and supported worker scheduling.
- Expose only operations that already have real backend implementations and user-level permissions.

## Release gates and blockers

- Apply reviewed migrations to staging before production; keep RLS and the private bucket enabled.
- Use a deployment plan or external protected scheduler that supports the required worker cadence. A daily Hobby cron is not adequate for queue processing.
- Verify provider adapters against live non-production accounts without claiming mock tests as live proof.
- Do not claim the whole platform upgrade complete until inbound and outbound MCP, all promised model adapters, worker recovery, security tests, build, and deployment have each been verified.
