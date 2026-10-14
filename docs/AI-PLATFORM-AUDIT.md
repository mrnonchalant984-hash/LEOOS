# LeonardX AI platform audit

Audit date: 2026-10-14. This is a focused audit of the AI, data, security, and deployment paths relevant to the requested model-provider, MCP, workforce, and creative upgrade; it is not a line-by-line audit of every application feature.

## Actual architecture

- Next.js 16.3.6 App Router, React 19, TypeScript, npm lockfiles, Tailwind CSS 4, and custom components in `app/` and `components/`.
- Supabase Auth/Postgres/Storage with server-side service-role access in `lib/auth.ts`; identity is resolved from the request, and some APIs use `getProfile`, `requireOwner`, and user-scoped queries.
- Hosted text and media provider access is centralized partly in `lib/openai.ts`. It supports OpenAI and an OpenAI-compatible local text endpoint. The local endpoint is server-configured and used for text only.
- Agent orchestration exists in `lib/agents/manager.ts` and the API/workforce routes. It includes role execution, durable workforce jobs, and worker endpoints, but is not a general-purpose multi-provider/MCP orchestrator.
- Image generation is implemented in `lib/generation/images.ts` and `/api/generate-image`, with generation jobs, credit accounting, and private Supabase media storage.
- Runway Gen-4.5 video creation exists in `/api/generate-video` and `/api/generate-video/status`. The checked adapter exposes text-to-video, not image-to-video.
- `generation_jobs`, `media_assets`, credit tables, and related RPCs are defined by existing Supabase migrations. The `leo-files` storage bucket is defined private in `supabase/schema.sql`.
- Vercel deployment is configured in `vercel.json`. Cron schedules are daily to be compatible with Hobby; daily execution is not an appropriate queue-processing cadence.

## Capability evidence

| Area | Repository evidence | State |
| --- | --- | --- |
| OpenAI text | `lib/openai.ts`, `/api/chat`, agent and meeting routes | Implemented |
| Local text model | `lib/openai.ts`, offline setup docs | Implemented for configured OpenAI-compatible text endpoints |
| Anthropic/Claude adapter | No official SDK integration or provider adapter found in inspected application sources/dependencies | Missing |
| Google/Gemini adapter | No official SDK integration or provider adapter found in inspected application sources/dependencies | Missing |
| Capability-based model registry/router | No shared registry/router found; model selection is currently configuration-specific | Missing |
| External MCP client | No MCP SDK or server connection manager found in inspected application sources/dependencies | Missing |
| LeonardX MCP server | No `/mcp` endpoint or MCP protocol server found | Missing |
| Workforce | Existing protected role and durable-job routes, worker, and UI | Partial; not a shared MCP/model orchestration layer |
| Image create | Existing OpenAI-compatible image generation and private persistence | Implemented, subject to provider config |
| Image edit | Added in this implementation through the existing OpenAI Images client, credit controls, and private storage | Implemented; live provider not verified |
| Video create | Existing asynchronous Runway Gen-4.5 text-to-video | Implemented, subject to provider config |
| Image-to-video | No configured adapter in the checked video route | Missing; not exposed in Studio |

## Security and operations observations

- Provider keys and Supabase service credentials are server-only by convention. New Studio handlers use server-side `getProfile`, `adminSupabase`, user-scoped queries, request limits, bounded image upload validation, private storage, and signed URLs.
- MCP connections do not exist yet. Adding arbitrary remote MCP URLs without strict egress/SSRF controls, per-tool approvals, and isolated credentials would create a significant security risk. No remote server should receive provider credentials or service-role data.
- The existing durable worker endpoints are not proof of a deployable always-on worker. Vercel Hobby daily schedules cannot provide timely queue processing. MCP server transport and long-running execution must be designed for the actual serverless lifecycle.
- Existing plan gates, rate limiting, credits, owner checks, and signed media routes should be reused; client-supplied user IDs or job states must never authorize operations.
- Live provider, staging database, and production deployment verification require the applicable environment credentials and external account access. None is claimed by this audit.

## Relevant source files

- Provider and text adapter: `lib/openai.ts`
- Agent runner: `lib/agents/manager.ts`, `lib/agents/role-runtime.ts`
- Runway adapter: `lib/agents/runway-video.ts`
- Image creation and edit: `lib/generation/images.ts`, `lib/generation/image-edit.ts`
- Auth, credits, and storage metadata: `lib/auth.ts`, `lib/access.ts`, `app/api/media/[id]/route.ts`
- Durable workforce routes: `app/api/workforce/`, `app/api/internal/workforce/worker/route.ts`
- Existing generation migration: `supabase/migrations/20261013110000_leonardx_generation_credits.sql`
- Deployment schedules: `vercel.json`

## Implementation order

1. Finish and validate the truthful Studio vertical slice using only the existing image and video providers.
2. Introduce a typed provider-neutral registry with explicit capability and configuration status, then add provider adapters one at a time using official SDKs and mocked contract tests.
3. Implement task routing only after the registry and capability checks exist; preserve explicit model selections and make fallbacks visible.
4. Design external MCP registration and client execution with fixed outbound controls, per-server/per-tool grants, approval, isolation, and audit before connecting user-supplied servers.
5. Design an inbound MCP endpoint only after choosing a deployment-compatible stateless transport and a real user authentication/authorization flow. Existing app cookies are not an OAuth flow.
6. Extend, rather than duplicate, durable workforce orchestration; use an execution runtime with bounded duration, retry, cancellation, and supported scheduling.
7. Add live staging/provider verification and deployment only after migrations, secrets, transport, and worker cadence are confirmed.
