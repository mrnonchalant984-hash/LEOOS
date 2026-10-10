# LeonardX Integration Studio — Audit and Implementation Plan

Audit date: 2026-10-10  
Repository: existing LeonardX / LEO OS application  
Git baseline: `codex/leonardx-readiness-20261010` at `f979b08`; worktree was clean before this audit.

## Executive summary

The repository already contains usable API-key endpoints, a TypeScript SDK, a local CLI, authenticated project APIs, a restricted API playground handler, and a real webhook management/delivery flow. The walkthrough should explain and preview those existing contracts; it must not pretend that the CLI can dispatch builds or deploy, that the SDK has been published, or that webhook events beyond `webhook.test` are active.

The audit found documentation drift that should be corrected alongside the studio: the SDK page instantiates a class that is not exported as shown, API docs claim 60 requests/minute while the server currently configures 120, and webhook retry copy does not match the deployed daily cron schedule. The webhook implementation also has a second, older worker/table path alongside the current endpoint implementation; this task will not merge or replace either system.

## Existing integration surfaces

| Surface | Current state | Evidence |
| --- | --- | --- |
| API keys and API | Present: API keys authenticate via one-way hash lookup, expiry/revocation/scope checks, per-key Postgres rate-limit RPC, request IDs, and request logging. Current supported API routes include project list/create, profile, usage, project metadata, and project status. | [API auth](./lib/api-auth.ts), [v1 projects](./app/api/v1/projects/route.ts), [v2 projects](./app/api/v2/projects/route.ts), [v2 profile](./app/api/v2/me/route.ts), [v2 project status](./app/api/v2/projects/%5Bid%5D/status/route.ts) |
| API playground | Backend handler exists and only proxies four allowlisted method/path combinations. API key is accepted per request and forwarded server-side; only response status, request ID, and body are returned. The inspected docs page does not provide an interactive playground UI. | [playground handler](./app/api/docs/playground/route.ts), [API docs page](./app/docs/api/page.tsx) |
| TypeScript SDK | Source package `@leo-os/sdk` exports `LeoClient`, typed project methods/errors, and webhook signature verification. SDK tests cover API calls, errors, limits, signature verification, path boundaries, and scratchpad contracts. Package README says it is not published to npm. | [SDK package](./packages/sdk/package.json), [SDK source](./packages/sdk/src/index.ts), [SDK README](./packages/sdk/README.md), [SDK tests](./tests/sdk.test.mjs) |
| CLI | Source package provides `leo login`, `init`, `status`, `projects list/create`, logout, and local orchestration helpers. Login validates against `/api/v2/me`; config is saved with restrictive permissions. `deploy --brief` and `ship` explicitly stop without dispatching. CLI README indicates local invocation/linking; package publication is not verified. | [CLI package](./packages/cli/package.json), [CLI implementation](./packages/cli/src/index.mjs), [CLI README](./packages/cli/README.md), [CLI orchestration tests](./tests/cli-orchestration.test.mjs) |
| Webhooks | Current developer API creates/owns endpoints, reveals secret only on creation, sends real `webhook.test`, records attempts, signs payloads with HMAC-SHA256, validates HTTPS destinations, and exposes delivery history/retry. The current implementation supports only `webhook.test`. | [webhook API](./app/api/developers/webhooks/route.ts), [delivery logic](./lib/webhooks.ts), [webhook contracts](./lib/webhooks-core.ts), [webhook UI](./components/WebhooksPanel.tsx), [webhook tests](./tests/webhooks.test.mjs) |
| Existing docs | API docs exist at `/developers/docs` and `/docs/api`; SDK docs exist at `/docs/sdk`; webhook management is at `/webhooks`; the developer overview is at `/developers`. There is no separate CLI walkthrough page and no existing Integration Studio component. | [developers](./app/developers/page.tsx), [API reference](./app/developers/docs/page.tsx), [API overview](./app/docs/api/page.tsx), [SDK page](./app/docs/sdk/page.tsx), [webhooks page](./app/webhooks/page.tsx) |

## Verified mismatches and limits

1. [app/docs/sdk/page.tsx](./app/docs/sdk/page.tsx) shows `LeoOS` as the import/constructor, but current SDK documentation and source use `LeoClient`. The alias exists in source for compatibility, but the page omits real methods/context and is not a synchronized tutorial.
2. [app/developers/docs/page.tsx](./app/developers/docs/page.tsx) documents 60 requests/minute; [lib/api-auth.ts](./lib/api-auth.ts) calls `consume_api_rate_limit` with a 120-request limit per 60-second window. Walkthrough text will show the actual API contract and explicitly label any API behavior that cannot be exercised without a user's credential.
3. The current webhook scheduler in [vercel.json](./vercel.json) invokes `/api/cron/webhooks` once daily. Its delivery core queues retries at increasing delays, but those due retries cannot be assumed to run at the documented minute/hour cadence with this schedule. The integration walkthrough must not imply prompt retries.
4. [app/api/internal/webhooks/worker/route.ts](./app/api/internal/webhooks/worker/route.ts) uses a separate legacy `webhooks` / `webhook_events` data model from the `webhook_endpoints` / `webhook_deliveries` developer UI. This work will describe only the UI's current system and will not consolidate schema or handlers.
5. [app/api/docs/playground/route.ts](./app/api/docs/playground/route.ts) is a real allowlisted proxy, not itself a rendered playground. The walkthrough's demo state must be marked simulated and must never send an API key or mutate data.
6. `leo deploy --brief` and `leo ship` are intentionally unavailable to API-key CLI users. The walkthrough can explain that boundary and show the supported authenticated project operations, but it must not animate a successful cloud dispatch/deployment.
7. The SDK package is configured for package output and has a build script, but `npm` publication and the intended package-name availability were not verified. It remains unpublished per its README.
8. The current webhook panel handles endpoint creation, test send, retry, delivery inspection and deletion, but presentation is compact and not organized as a guided, selectable walkthrough. It remains the real management surface; studio examples are separate and synthetic.

## Integration Studio implementation proposal

- Add one reusable, client-only walkthrough component under the existing developer UI; keep route pages as Server Components and import the interactive component narrowly, consistent with the installed Next.js Server/Client Component guidance.
- Mount the same component within existing API, SDK, CLI/developer overview, and webhook routes. Do not add duplicate routes or replace the functional webhook panel.
- Use selectable integration scenarios and deterministic steps: request/response for API, actual SDK method and error handling for SDK, supported local commands plus explicit blocked dispatch for CLI, and signed `webhook.test` delivery for webhooks.
- Keep all walkthrough data static and synthetic. Display a persistent “Simulation — no request sent” label, show a prominent “Live capability” label only for existing real controls, and do not collect credentials or call backend routes from the simulator.
- Synchronize active walkthrough step and highlighted source lines; provide play/pause, reset, next/previous, scenario selection, and copy-to-clipboard. Add responsive code/visualization switching for narrow screens, keyboard-accessible controls, live status announcements, and reduced-motion handling.
- Use existing monochrome/gold design tokens and installed icon/UI conventions. Avoid new dependencies, global navigation changes, schema changes, or webhook/API modifications.
- Correct the outdated SDK example and inaccurate rate-limit/retry guidance only where the inspected server implementation supports the replacement wording.

## Baseline and verification status

- Next.js: `16.3.6`; React: `19.1.0`.
- Relevant installed Next.js docs were read from `node_modules/next/dist/docs/`: Server and Client Components, linking/navigation, CSS, `use client`, accessibility, and the Server/Client boundary. The implementation will preserve Server Components and isolate interaction in a small client boundary.
- Existing test files include SDK, webhook, API-key, CLI orchestration, API usage, and project/IDE tests. The integration walkthrough has no dedicated tests yet.
- No source files or product routes have been modified at audit time. Only this audit document is being added before implementation.
- Baseline verification completed before implementation: `npm run typecheck` passed; `npm test` passed 32/32; `npm run lint` completed with 0 errors and 12 warnings in unrelated existing files; `npm run build` passed and generated 149 routes. Post-change results are recorded in the final report.

## Scope exclusions

- No API key transmission from the browser simulator.
- No fake telemetry, deployment progress, webhook receipt, success metrics, or provider status.
- No database migration or production data change.
- No publishing of `@leo-os/sdk` or `@leo-os/cli`.
- No changes to authentication, billing, API authorization, webhook signing, retry workers, or production deployment configuration as part of the walkthrough task.
