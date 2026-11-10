# LeonardX Implementation Gap Analysis

## Prioritization

The master specification describes a broad product; the gaps below are
sequenced so that safe execution, isolation, and evidence precede expansion of
capabilities. "Not verified" means source evidence or a safe local test is
insufficient to claim the behavior works; it is not an assertion that a
production resource does not exist.

## Critical foundations

| Priority | Gap | Current state | Required outcome / acceptance evidence |
|---|---|---|---|
| P0 | A bounded, tenant-scoped workspace execution and preview lifecycle | File editing exists; the web IDE disables arbitrary shell use. The isolated runner is a separate constrained service with deployment prerequisites. | Start/stop a compatible project in an isolated workspace; enforce ownership, resource/network/process limits, timeouts, cleanup, and logs; return a verified preview URL. Integration tests must demonstrate cross-tenant denial and failure handling. |
| P0 | Preview separated from production deployment | Website build flow synchronizes GitHub and deploys to Vercel production. No generated-project preview route/provider is found. | Add an independently authorized, non-production preview provider and state model. Preview must not mutate production deployment state, GitHub production settings, or live URL fields. |
| P0 | Provider-independent model routing | Gemini is the only enabled central execution provider. | Define capability metadata and provider adapters; test configured/unconfigured provider behavior, structured output, streaming/tool-call paths, rate limiting, and error normalization. Never fall back to an incompatible capability. |
| P0 | Agent tool/permission contract | Agent APIs and manager exist, but complete per-agent schemas, least-privilege tool matrices, and validation rules are not verified. | Every agent has explicit input/output, allowed tools/skills, limits, and output validation. Tests prove denied tool calls cannot be bypassed through prompt or user-supplied role values. |
| P0 | Reproducible external integration tests | Many capabilities depend on Supabase, Gemini, GitHub, Vercel, browser, or isolated-host configuration. | Mocked contract tests for normal and failure paths, plus a separately gated end-to-end environment that reports each unavailable dependency rather than a success-shaped fallback. |
| P0 | Tenant and privileged-operation authorization | Existing ownership/plan checks are present but not a complete authorization proof for every operation in the master spec. | Audit sensitive handlers and database policies, test tenant isolation, reserve production writes/destructive operations for explicit approval, and keep owner authority independent of editable profile roles. |

## Cloudflare preview and workspace

### Current implementation and remaining gaps

1. **Implemented, not activated:** A default-disabled, static-only Pages
   preview queue, owner-scoped APIs, quota/admission migration, scheduled
   GitHub Actions worker, and Web IDE status/preview UI are present. See
   [Cloudflare onboarding](./CLOUDFLARE_ONBOARDING.md). The migration is not
   applied and Cloudflare credentials are not configured.
2. **Static-only compatibility:** Inputs require a root `index.html`, bounded
   static text assets, allowed file types, and no recognized credential
   patterns. This scan is not exhaustive. Framework compilation, server-side
   code, binary assets, and arbitrary scripts are not executed.
3. **Workspace and artifact lifecycle:** A preview job and stable branch alias
   are associated with an owned project. There is no isolated dynamic runtime,
   immutable per-request URL, preview TTL, or automated cleanup of historical
   Cloudflare deployment records.
4. **Preview routing and isolation:** The UI embeds only the verified HTTPS
   preview host using a sandboxed iframe. The URL is public and the preview
   host is not a confidential-data boundary; no comprehensive CSP/cookie or
   abuse-control layer is established.
5. **Usage controls:** The migration defines per-user daily/monthly admission,
   a combined monthly build allowance, an account rolling-30-day cap, and one
   active job per project. Provider free quotas and historical deployment
   storage/cleanup still require operational monitoring.
6. **Provider verification:** The worker checks the configured Pages project
   and uses pinned Wrangler, but the project-source response shape, branch
   readiness, account authorization, and end-to-end deployment remain
   unverified.

### Safe implementation order

1. Review and apply the preview migration only after explicit approval and a
   safe database backup/verification plan.
2. Pre-create a Cloudflare Pages Direct Upload project and configure the
   documented server environment and GitHub Actions secrets; do not let the
   worker create Cloudflare resources.
3. Run account-backed tests for source-type verification, branch alias
   readiness, result/lease handling, quotas, and cleanup after explicit
   authorization.
4. Add TTL and provider-side historical deployment cleanup with tested
   retention limits before treating this as a managed preview lifecycle.
5. Expand beyond static assets only with a separately isolated build/runtime
   design, framework-specific validation, and explicit resource budgets.

Cloudflare documents Workers Free at 100,000 requests/day and 10 ms CPU per
invocation; Pages Free at 500 builds/month with one concurrent build; R2
includes finite free storage and request allowances; Queues Free has
10,000 operations/day and 24-hour retention. See the linked official pricing
and limits sources in [repository audit](./REPOSITORY_AUDIT.md). These
provider-level allowances do not replace LeonardX's own budget enforcement.

## Remaining master specification gaps

| Area | Main missing or unverified work |
|---|---|
| Model engine | Multi-provider adapters, verified capability registry, cost/usage accounting, health checks, and safe routing. |
| Agent/workflow engine | Agent registry, entitlements, approval gates, durable workflow queues, dependency validation, retries, and cancellation exist. Per-agent input/output contracts are validated; sensitive/write-capable agents require approval. Workflow runs persist step outputs, resume successful steps, pause for explicit agent approval, support user cancel/retry, and parallelize only bounded dependency-ready read-only steps. Approved read-only MCP tools require explicit per-specialist grants and are rechecked at execution. Specialist model calls have an agent deadline, bounded configured fallback attempts, and will not replay after tool execution starts. Remaining gaps include stronger atomic workflow/job transitions, live-provider execution evidence, and broader end-to-end specialist integrations. |
| Context/project understanding | Incremental repository indexing, symbol-aware retrieval, project instructions, large-repository limits, and tenant-isolation tests. |
| Skills | External source onboarding, versioning/trust model, executable sandbox, declared permissions/dependencies, tests, approvals, rollback, and monitoring. |
| Execution/workspaces | A verified isolated runtime, persistent workspace lifecycle, controlled dependency installation, terminal streaming, cancellation, snapshots, and no-network-by-default enforcement. |
| Framework development | Project detection and build/test adapters across the specified frontend, backend, mobile, and database stacks. |
| Low-code | Visual canvas, layout/property editors, data binding, workflow builder, source-code synchronization, and accessible preview. |
| Design/motion/3D | Reusable design tokens and optional framework integrations with reduced-motion/accessibility/performance checks. |
| SQL/database | General schema discovery and guarded query workflows; read-only defaults; approval and audit for production writes. |
| API/MCP gateways | Complete shared input/output validation, versioning, rate limiting, idempotency, and distinct public/internal boundaries across all relevant routes. |
| Image/voice/documents | End-to-end tests for provider availability, object permissions, credits/refunds, browser formats, deterministic binary validation, and downloads. |
| Browser/testing/debugging | Real running-project preview, Playwright interaction, console/network reporting, accessibility checks, structured test results, and debugging recovery. |
| Deployment/project management | Provider adapters, preview-vs-production controls, verified deployments, project lifecycle, history, notifications, and rollback. |
| Billing/entitlements | Consistent server-side enforcement and metering across all API, agent, model, execution, storage, and deployment paths. |
| Monitoring/audit | Centralized event schema, actionable health checks, tenant-safe telemetry, retention, alerting, and verified failure reporting. |
| LeoCode | Complete editor/workspace operation coverage, approval UX, safe tools, project understanding, diagnostics, and packaged-extension verification. |

## Recommended delivery gates

### Gate 1 — Architecture and contracts

- Keep the present application and data model; define bounded module
  interfaces and a status/error contract.
- Complete source-backed audit documents and identify deployment-only
  unknowns.
- No provisioning, migrations, or production changes.

### Gate 2 — Secure workspace/preview foundation

- Implement compatibility-gated preview separately from production deploy.
- Require tenant authorization, lifecycle/cleanup, bounded resource budgets,
  and mocked provider-contract tests.
- Enable live provider use only after account/configuration and quota approval.

### Gate 3 — Agent and model reliability

- Add provider capabilities and agent permission schemas.
- Validate workflow outputs and all tool results.
- Test missing provider, rate limit, timeout, cancellation, and retry paths.

### Gate 4 — Incremental capability expansion

- Add framework adapters and browser validation first; then skills,
  database/design/document/voice features behind explicit entitlements and
  feature gates.
- Publish only capabilities with passing implementation-level and
  environment-backed acceptance evidence.

## Explicit non-actions

This assessment does not provision Cloudflare resources, install the optional
beta `cf` CLI, authorize OAuth, make a production deployment, apply database
migrations, or incur provider charges.
