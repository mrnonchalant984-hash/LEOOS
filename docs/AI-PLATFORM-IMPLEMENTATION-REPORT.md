# AI platform implementation report

Date: 2026-10-15

## Delivered in this milestone

- Added `/studio` within the existing LeonardX app shell and a Workspace navigation entry.
- Exposed the existing text-to-image endpoint and existing Runway Gen-4.5 text-to-video endpoint without adding unsupported model choices.
- Added authenticated OpenAI image editing using the installed official OpenAI SDK. The request validates PNG/JPEG/WebP file signatures and MIME, enforces a 4 MB image limit, uses existing rate limits and credit reservation/refund functions, stores the source and result separately in private Supabase Storage, records the generation job, and uses ownership-checked signed media URLs.
- Added a user-scoped, bounded studio history endpoint and UI, including the ability to resume checking an existing processing video job.
- Added upload/workflow tests, architecture and readiness documentation, a repository evidence audit, and an implementation roadmap.

## Verification evidence

- Full repository test run: 147 passed, 0 failed.
- TypeScript check: passed.
- ESLint: passed with one existing `selectedExecutor` hook-dependency warning in `app/meeting-room/page.tsx`.
- Production build: compiling successfully; final build completion is pending.
- `supabase migration list` reports the MCP OAuth/connections migration as applied in the linked Supabase project. This does not establish which production deployment or environment is connected.
- Live provider calls and Vercel deployment are not verified.

## Added in the current working changes (not yet deployed)

- Server-side OpenAI, Anthropic, Google Gemini, and configured local text adapters use a typed model registry. The `/api/models` endpoint reports configured provider/model availability without exposing credentials.
- Inbound MCP is implemented as a stateless Streamable HTTP server at `/mcp`. OAuth registration, authorization-code flow with PKCE S256, refresh-token rotation/revocation, consent, and discovery metadata are provided by `/oauth/*` and `/.well-known/oauth-*`. The registered server tools are user-scoped read-only `list_projects` and `get_project_status`.
- Outbound MCP uses the Integrations page and `/api/mcp/servers` APIs. Endpoints must be HTTPS on an operator allowlist; DNS is validated and pinned, redirects are rejected, requests/responses are bounded, and optional bearer credentials are encrypted at rest. Users explicitly approve tools. Autonomous chat orchestration filters to explicitly approved read-only tools and re-checks grants at call time.
- Leo chat has an explicit "Use approved read-only tools" mode. Provider-native tool calls are implemented for OpenAI, Anthropic, and Gemini; local model tool calling returns an explicit unsupported error.
- The existing Runway Gen-4.5 image-to-video endpoint is now reachable from Studio using an owned private image asset and a short-lived signed URL.

These are code and local validation claims only. The changes have not been pushed or deployed, provider credentials have not been live-tested, and the linked database migration status does not verify production runtime behavior. Do not claim production availability until deployment and endpoint tests pass. Outbound MCP OAuth and autonomous write-capable tools are intentionally not supported.

## Configuration

The Studio reuses existing server configuration: `OPENAI_API_KEY` or `LEO_API_KEY`, Supabase URL/service-role key, the existing generation migration and private `leo-files` bucket. The optional `LEO_IMAGE_MODEL` must name a model supported by the configured Images API. Video additionally uses existing Runway and credit settings.

For the broader AI/MCP implementation, configure the provider credentials in `.env.example` as needed. Set `MCP_PUBLIC_URL` to the production HTTPS origin, `MCP_ALLOWED_ORIGINS` to trusted client origins, `MCP_OUTBOUND_ALLOWED_HOSTS` to exact remote MCP hostnames, and `MCP_CREDENTIAL_ENCRYPTION_KEY` to a stable random 32-byte key (hex or base64). Apply the MCP OAuth/connections migration before using OAuth or remote connections. Provider keys and the encryption key must remain server-side and must not be logged or returned to clients.

## Deployment and rollback

The new MCP OAuth/connections migration is `supabase/migrations/20261015120000_mcp_oauth_and_connections.sql`; the linked Supabase project reports it as applied. Before rollout, verify the intended production database and private `leo-files` bucket, configure the server-side provider/MCP settings, and test OAuth, MCP tools, image create/edit, image-to-video, signed history/downloads, plan access, and refunds using non-production accounts. Roll back by reverting the feature routes, UI, provider integration, migration only through a reviewed forward migration if necessary, tests, and docs. Existing image and video operations remain separate.
