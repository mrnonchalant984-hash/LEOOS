# LeonardX AI platform audit

Audit date: 2026-10-15. This is a focused audit of the AI, data, security, and deployment paths relevant to the requested model-provider, MCP, workforce, and creative upgrade; it is not a line-by-line audit of every application feature.

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
| Anthropic/Claude adapter | `lib/ai/provider-registry.ts`, official Anthropic SDK, `/api/chat` | Implemented in working tree; provider call not live-tested |
| Google/Gemini adapter | `lib/ai/provider-registry.ts`, official Google GenAI SDK, `/api/chat` | Implemented in working tree; provider call not live-tested |
| Capability-based model registry/router | `lib/ai/model-catalog.ts`, `/api/models`, `/api/chat` | Implemented in working tree; credentials and hosted routing not live-tested |
| External MCP client | `lib/mcp/remote-clients.ts`, `/api/mcp/servers`, Integrations page | Implemented in working tree; migration and remote server not live-tested |
| LeonardX MCP server | `/mcp`, OAuth 2.1 + PKCE routes, `lib/mcp/server.ts` | Implemented in working tree; migration and deployment not verified |
| Workforce | Existing protected role and durable-job routes, worker, and UI | Partial; chat tool mode orchestrates only user-scoped read-only tools |
| Image create | Existing OpenAI-compatible image generation and private persistence | Implemented, subject to provider config |
| Image edit | Added in this implementation through the existing OpenAI Images client, credit controls, and private storage | Implemented; live provider not verified |
| Video create | Existing asynchronous Runway Gen-4.5 text-to-video | Implemented, subject to provider config |
| Image-to-video | `/api/generate-video` now supplies an ownership-checked private asset's short-lived signed URL to Runway | Implemented in working tree; live provider not tested |

The changes are pushed to `main` as `4bcf48a6d4aabb763b98624968fceaf9fd98e906`, and the public `/mcp` route and OAuth discovery metadata respond. An unauthenticated initialize probe correctly receives `401`; authenticated deployed tool calls and the exact deployed commit remain unverified. `supabase migration list` reports `20261015120000` applied in the linked Supabase project; this does not prove that the deployed application targets that database. Remote MCP still requires operator hostname allowlisting and optional credential-encryption key configuration. Autonomous orchestration intentionally excludes write-capable remote tools.

## Security and operations observations

- Provider keys and Supabase service credentials are server-only by convention. New Studio handlers use server-side `getProfile`, `adminSupabase`, user-scoped queries, request limits, bounded image upload validation, private storage, and signed URLs.
- Remote MCP connections now require strict egress/SSRF controls, per-tool approvals, and isolated credentials. These protections are implemented in the working tree but have not been live-tested against an external MCP server. No remote server should receive provider credentials or service-role data.
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

## Remaining release checks

1. Confirm the exact Vercel deployment SHA and environment configuration for the pushed `main` commit.
2. Verify deployment environment variables, especially provider credentials, `MCP_PUBLIC_URL`, trusted origins, outbound hostname allowlisting, and the stable credential-encryption key when remote bearer credentials are used.
3. Verify that the deployed application uses the Supabase project where migration `20261015120000` is applied.
4. Exercise OAuth, inbound MCP initialization/tool discovery/read-only calls, outbound MCP discovery/manual approval, provider routing, and image-to-video using non-production accounts and configured providers.
5. Inspect deployment logs and validate the deployed MCP endpoint with protocol-aware clients before claiming production availability.
