# Existing LeonardX System Map

This map describes the current source architecture and observed request paths.
It is not a target architecture and does not imply production availability.

## Application structure

```text
Next.js App Router
  ├─ UI: app/, components/
  ├─ HTTP APIs: app/api/
  ├─ Domain/services: lib/, services/
  ├─ Persistence: Supabase/PostgreSQL, schema.sql and migrations
  ├─ Durable build orchestration: leo_build_jobs + GitHub Actions worker
  ├─ Static preview queue: cloudflare_preview_jobs + GitHub Actions worker (disabled)
  ├─ Project file editor: Web IDE + owner-scoped workspace files API
  ├─ Constrained execution component: services/isolated-runner
  └─ VS Code client: extensions/leocode
```

The application has central authentication and Supabase helpers, but the
repository is not yet a single modular system covering every engine in the
master specification. Existing capability is distributed across API routes,
provider-specific code, database functions, background workflows, and UI
surfaces.

## Request and data flows

### Website project production build

```text
Project setup UI
  → POST /api/setup/projects
  → authenticate, validate plan/type/capacity
  → create website_projects row

Build request / durable worker
  → POST /api/build-deploy
  → authenticate user or validate internal worker lease
  → create/update project_builds and deployment_events
  → generate or validate project source
  → synchronize source to GitHub
  → deploy through Vercel
  → verify deployment result and persist live status/URL
  → UI reads persisted project/build state
```

Evidence: [project setup route](../../app/api/setup/projects/route.ts),
[build/deploy route](../../app/api/build-deploy/route.ts),
[build worker workflow](../../.github/workflows/leo-build-queue-worker.yml),
and [database schema](../../supabase/schema.sql).

This path deploys production through Vercel. It is not a preview-only
Cloudflare path and should not be silently repurposed as one.

### Project workspace and code editing

```text
Web IDE
  → authenticated project/file APIs
  → owner-scoped Supabase project record and files JSON
  → edits persisted files
```

The Web IDE can request a static-only Cloudflare Pages preview for a bounded,
prebuilt bundle. It does not start the user's project, build framework source,
or execute an arbitrary terminal command. The generic
[live preview frame](../../components/engineering/LivePreviewFrame.tsx) is
used only when a validated preview URL is available; it no longer points at
the LeonardX application origin as a stand-in.

The separately documented isolated runner is a constrained integration with
its own deployment prerequisites. No repository evidence connects it to a
persistent per-project browser preview lifecycle.

### AI and agents

```text
Chat/agent API
  → authentication, policy and plan checks
  → model catalog and Gemini provider registry
  → agent manager/tools where applicable
  → response, persisted messages, or delegated background work
```

The primary model implementation is Gemini. Provider/model decisions live in
[model catalog](../../lib/ai/model-catalog.ts) and
[provider registry](../../lib/ai/provider-registry.ts). Other utility files
must not be mistaken for a fully configured multi-provider engine.

### MCP and skills

```text
MCP client request
  → user-owned server registration
  → outbound URL/credential controls
  → tool discovery and input checks
  → configured per-tool authorization/approval
  → remote server call and normalized result
```

The MCP application surfaces are
[server API](../../app/api/mcp/servers/route.ts) and
[outbound security](../../lib/mcp/outbound-security.ts). Built-in and
user-owned skills are discovered through
[skill registry](../../lib/skills/registry.ts). The workspace MCP endpoint is
configured in [.vscode/mcp.json](../../.vscode/mcp.json), but Cloudflare OAuth
authorization and account access have not been performed.

### Static Cloudflare preview

```text
Web IDE
  → POST /api/workspaces/{id}/preview
  → verify session, project ownership, plan, and bounded static assets
  → create_cloudflare_preview_job (owner/plan/quota admission)
  → cloudflare_preview_jobs
  → scheduled GitHub Actions worker claims one leased job
  → check configured Pages project, publish to stable preview branch with Wrangler
  → verify preview hostname/branch and report result
  → Web IDE polls owner-scoped status; sandboxed iframe shows verified URL
```

Evidence: [preview route](../../app/api/workspaces/[id]/preview/route.ts),
[preview worker APIs](../../app/api/internal/previews/worker/route.ts),
[result API](../../app/api/internal/previews/result/route.ts),
[database migration](../../supabase/migrations/20261105120000_cloudflare_static_previews.sql),
[worker script](../../scripts/cloudflare-preview-worker.mjs), and
[workflow](../../.github/workflows/cloudflare-preview-worker.yml).

The path is disabled by default and not account-tested. It is not a general
runtime: the accepted inputs are prebuilt static assets, public preview URLs
may contain user content, and historical Cloudflare deployment cleanup is
not automated. See [Cloudflare onboarding](./CLOUDFLARE_ONBOARDING.md).

## Persistence

| Data | Current store/evidence | Notes |
|---|---|---|
| Generic projects and source files | Supabase `projects` in [schema](../../supabase/schema.sql) | File data is stored with project records; file API is owner-scoped. |
| Website projects | Supabase `website_projects` | Includes build and live deployment fields. |
| Build history | Supabase `project_builds` | Holds provider, status, step, logs, deployment ID/URL. |
| Deployment events | Supabase `deployment_events` | Records build/deploy progress. |
| MCP configuration | User-owned database-backed server records | Uses existing connection security and authorization code. |
| Skills | Local files and user-owned persisted entries | No external Cloudflare skill sync is present. |
| Static preview deployments | Supabase `cloudflare_preview_jobs` in the unapplied [preview migration](../../supabase/migrations/20261105120000_cloudflare_static_previews.sql) | Owner-scoped status, queue lease, deployment URL, and quota admission are defined; not available until migration/configuration and not account-verified. |

## External systems

| System | Use in current source | Runtime status |
|---|---|---|
| Google Gemini | Main model provider and image-generation paths | Requires valid server-side configuration; not live-tested here. |
| Supabase | Auth-adjacent data, projects, builds, skills, configuration | Source configured; deployed connectivity not verified. |
| GitHub | Source synchronization and build workflow | Requires secrets/account authorization; not invoked here. |
| Vercel | Current website production deployment target | Requires credentials/account setup; no deployment made. |
| Cloudflare Pages | Static-only preview worker in [GitHub Actions workflow](../../.github/workflows/cloudflare-preview-worker.yml) | Disabled by default; Wrangler 4.159.0 is installed locally. Project credentials, account behavior, and deployments are unverified; no OAuth or resource creation was performed. |
| Isolated runner host | Separate fixed-operation execution component | Requires its documented isolated host; not verified as deployed. |

## Cloudflare onboarding boundary

Cloudflare documents its managed MCP endpoint as
`https://mcp.cloudflare.com/mcp`, with OAuth authorization initiated by the
MCP client. Start with read-only permissions; do not authorize production
write scopes without explicit approval. Cloudflare's official skill
distribution is through a VS Code plugin source workflow. Neither OAuth
approval nor plugin installation should be performed implicitly by
application code.
