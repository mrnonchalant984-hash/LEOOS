# LeonardX Repository Audit

## Scope and evidence standard

This is a source-level audit of the existing LeonardX repository against the
master platform, Cloudflare preview/workspace, and Cloudflare agent-onboarding
requirements. It records observable code and configuration, not assumed
production behavior. The user-provided worktree contains unrelated and
pre-existing changes; this audit does not attribute those changes to this
review.

No Cloudflare account was connected, no OAuth authorization was attempted, no
resource was provisioned, and no deployment or paid provider call was made.
The source inspection is not an end-to-end production verification.

## Major capability status

| Capability | Status | Evidence and limits |
|---|---|---|
| Existing web application and project setup | Implemented, source-verified | The Next.js App Router application has project setup APIs and UI. Website projects are persisted separately from generic `projects`; see [project setup](../../app/api/setup/projects/route.ts) and [schema](../../supabase/schema.sql). |
| Gemini chat and model access | Implemented, source-verified; runtime unverified | Model selection and provider access are centralized in [model catalog](../../lib/ai/model-catalog.ts) and [provider registry](../../lib/ai/provider-registry.ts). Availability requires server-side Gemini credentials. |
| Provider-independent model engine | Incomplete | The central execution path explicitly enables Gemini only. An OpenAI utility exists in [lib/openai.ts](../../lib/openai.ts), but this does not establish a shared multi-provider router, capability registry, or configured Anthropic adapter. |
| Agent system | Incomplete | Agent execution and management code exists, including [agent manager](../../lib/agents/manager.ts) and API routes. The complete specialist identity/permission/schema/validation catalog and end-to-end orchestration guarantees in the master specification are not established by this source review. |
| Durable workflows and queued builds | Partially implemented | Supabase build records and a scheduled GitHub Actions worker exist. The worker claims a build through the application; this is not a general-purpose workflow engine or execution environment. See [build worker workflow](../../.github/workflows/leo-build-queue-worker.yml) and [schema](../../supabase/schema.sql). |
| Built-in and user skills | Partially implemented | The local skill registry discovers built-in and user-owned skills in [skill registry](../../lib/skills/registry.ts). Remote Cloudflare skill installation, signing, version management, sandboxed executable skills, and managed rollback are not established. |
| Remote MCP integration | Implemented, source-verified; provider connection unverified | User-managed MCP servers, outbound connection controls, validation, and approval mechanisms exist. See [MCP outbound security](../../lib/mcp/outbound-security.ts) and [MCP server API](../../app/api/mcp/servers/route.ts). A workspace Cloudflare endpoint is now configured in [.vscode/mcp.json](../../.vscode/mcp.json); OAuth and account access remain user-controlled and unverified. |
| Project file persistence and editing | Partially implemented | Project file data is stored in Supabase; owner-scoped file operations exist in [workspace files API](../../app/api/workspaces/[id]/files/route.ts). The web IDE edits persisted files but does not provide an enabled arbitrary shell. |
| Isolated command execution | Incomplete / externally blocked | A constrained runner service exists in [runner server](../../services/isolated-runner/server.py), with deployment and host prerequisites documented in its [README](../../services/isolated-runner/README.md). Its deployed availability and full workspace lifecycle have not been verified. |
| Website generation and production deployment | Implemented, source-traced; live deployment unverified | [Build/deploy API](../../app/api/build-deploy/route.ts) records progress, generates or accepts source files, synchronizes to GitHub, deploys to Vercel, and verifies a deployment result before marking it live. This is a production path, not an isolated preview path. |
| Generated-site live preview | Partially implemented; static-only and externally unverified | The Web IDE can enqueue a Cloudflare Pages preview for bounded, prebuilt static assets and display its status/URL. The engineering page no longer presents the LeonardX origin as a project preview. Framework builds, server execution, binary assets, and account-backed readiness are not supported or verified. See [preview API](../../app/api/workspaces/[id]/preview/route.ts), [preview worker](../../scripts/cloudflare-preview-worker.mjs), and [Web IDE](../../components/ide/WebIde.tsx). |
| Cloudflare preview/workspace integration | Partially implemented; disabled by default and externally unverified | A static-only Cloudflare Pages queue, owner-scoped APIs, quota/admission functions, a GitHub Actions worker, and preview UI exist in [preview migration](../../supabase/migrations/20261105120000_cloudflare_static_previews.sql), [preview API](../../app/api/workspaces/[id]/preview/route.ts), and [worker workflow](../../.github/workflows/cloudflare-preview-worker.yml). The migration is not applied; no Cloudflare account was authorized or deployment attempted. Wrangler 4.159.0 is installed locally. This is not a general workspace/runtime provider. |
| Database access | Partially implemented | Supabase/PostgreSQL schemas, RPCs, and row-level security are present in [Supabase schema](../../supabase/schema.sql). This does not establish a general SQL tool with guarded execution, schema discovery, and explicit production-write approvals. |
| Image generation and storage | Partially implemented; runtime unverified | Gemini-oriented image generation/editing code and storage paths exist, including [image generation](../../lib/generation/images.ts) and [Gemini image adapter](../../lib/generation/gemini-image.ts). Provider availability, private-object authorization, and complete credit reservation/settlement/refund behavior require environment-backed integration tests. |
| Voice | Partially implemented / externally dependent | Speech and realtime routes exist, but realtime access and browser-to-provider end-to-end behavior are not verified. Do not treat voice as production-verified based on route presence. |
| Document generation | Partially implemented | Document-generation code and dependencies exist. The complete deterministic generation, validation, storage, and download lifecycle for every requested format was not verified in this assessment. |
| Browser automation and testing | Partially implemented | Repository CI runs `npm run verify` in [CI workflow](../../.github/workflows/ci.yml), and test suites exist. This does not establish a connected browser-preview engine or comprehensive framework-specific test orchestration. |
| Low-code visual builder | Missing / incomplete | Project setup flows and a code editor exist; a complete visual canvas, drag/drop builder, synchronized source generation, and exportable low-code engine are not established. |
| GitHub and Vercel integration | Implemented, source-traced; credentials/service unverified | The website build path integrates with GitHub and Vercel, subject to server configuration. No external deployment was attempted in this audit. |
| VS Code extension | Partially implemented | A LeoCode extension and native agent/tool contributions exist in [extension manifest](../../extensions/leocode/package.json). The extension does not establish all of the master specification's workspace execution, approval, validation, and agent lifecycle capabilities. |
| Security, billing, and permissions | Partially implemented | Authentication, plan checks, project ownership, MCP approvals, and credit-related code exist. Each sensitive flow still requires focused authorization and tenant-isolation testing; role/configuration fields alone are not evidence of secure owner access. |

## Key source-traced flows

### Website project creation and deployment

1. Authenticated project creation validates project type, plan, capacity, and
   inputs in [project setup API](../../app/api/setup/projects/route.ts).
2. Website project state, build records, deployment events, and ownership
   policies are defined in [Supabase schema](../../supabase/schema.sql).
3. [Build/deploy API](../../app/api/build-deploy/route.ts) orchestrates source
   generation, progress persistence, repository synchronization, production
   deployment, and deployment-result verification.

### Static Cloudflare preview

1. The authenticated Web IDE submits the current project files to the
   owner-scoped [preview API](../../app/api/workspaces/[id]/preview/route.ts).
2. The API checks project ownership, plan entitlements, and static-file
   eligibility before asking the database function to enforce admission and
   quotas. The job is persisted in
   [preview migration](../../supabase/migrations/20261105120000_cloudflare_static_previews.sql).
3. The scheduled [GitHub Actions worker](../../.github/workflows/cloudflare-preview-worker.yml)
   claims one job, checks the configured Cloudflare Pages project, uses pinned
   Wrangler to publish the static files to a preview branch, and reports a
   verified preview URL. The UI polls the persisted job state.

This feature is disabled by default and has not been tested with a configured
Cloudflare account. It accepts a bounded static bundle only; it does not build
framework projects or execute project code. Preview URLs are public, and
automatic deletion of historical Cloudflare deployment records is not
implemented. See [Cloudflare onboarding](./CLOUDFLARE_ONBOARDING.md).
4. The scheduled [GitHub Actions worker](../../.github/workflows/leo-build-queue-worker.yml)
   processes durable work by calling the application.
5. There is no separate Cloudflare preview step in this path.

### Editing and execution

1. The workspace files API reads and updates files associated with an
   authenticated user's project.
2. [Web IDE](../../components/ide/WebIde.tsx) is an editor, not a local
   terminal. Its arbitrary command execution is disabled.
3. A separate [isolated runner](../../services/isolated-runner/server.py)
   advertises fixed, bounded operations and has explicit host/runtime
   prerequisites; no live runner deployment was checked.

### MCP and skills

1. The application stores user-managed MCP server connections and applies
   outbound URL and permission controls.
2. The skill registry discovers local built-ins and user-owned persisted
   skills. It does not currently fetch and update Cloudflare's external skill
   source automatically.
3. Cloudflare's managed MCP endpoint is configured at
   `https://mcp.cloudflare.com/mcp` in [.vscode/mcp.json](../../.vscode/mcp.json)
   and requests user OAuth authorization. No OAuth grant or account operation
   has been made. The endpoint's GET response is not a test of authenticated
   MCP operation.

## Cloudflare operational constraints observed

Cloudflare's official documentation describes the following relevant free-tier
limits. These are provider limits, not limits enforced by LeonardX:

- Workers Free: 100,000 requests per day and 10 ms CPU time per invocation.
- Pages Free: 500 builds per month, one concurrent build, up to 20,000 files
  per site, and a 25 MiB maximum asset size.
- R2 free allowance: 10 GB-month storage, 1 million Class A operations, and
  10 million Class B operations per month.
- Queues Free: 10,000 operations per day and 24-hour message retention.

References: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Pages limits](https://developers.cloudflare.com/pages/platform/limits/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/), and
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).
Any future integration must enforce application-level budgets and hard-fail
when provider configuration or quota is unavailable. The existence of free
allowances does not authorize provisioning or guarantee that use remains free.

## Verification limits

- Source inspection cannot prove deployed environment variables, database
  migrations applied in production, external credentials, OAuth grants, or
  provider account state.
- `npm run verify` is configured in CI; only focused checks run for prior,
  unrelated worktree changes are not evidence that every requested feature
  works end to end.
- A pre-existing untracked file with NUL bytes blocks a whole-repository
  TypeScript check. See the task handoff for that known limitation; this audit
  does not modify or sanitize it.
- No production build/deployment, Cloudflare resource creation, migration, or
  paid operation was performed.
