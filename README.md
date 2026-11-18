# Braverton — AI software creation platform

Braverton is an AI-assisted software creation platform with project demos, authenticated workspaces, developer APIs, billing, and integrations.

## Added/connected
- Owner/founder enforcement for `leonardudoh5@gmail.com` on the backend.
- Owner free access path and owner greeting.
- Supabase profiles, subscriptions, payments, credits, feature access, projects, admin logs, chat memory and notifications schema (additive migration).
- RLS policies and owner access helper.
- Paystack webhook verification with server-side signature validation and subscription/credit updates.
- Credit-gated image generation with owner bypass.
- `/dashboard` and owner-only `/admin`.
- TOTP 2FA setup for the owner admin path with backup codes.
- Full-screen ChatGPT-style LEO chat UI with hands-free voice conversation, transcript display, spoken assistant replies, suggestions, generated-image display and per-user chat persistence.
- 3D particle background and reusable glass-card styling.
- Blog, terms, privacy, refund-policy, sitemap and robots routes.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill the required values.
3. Run `supabase/schema.sql` and the required migrations in the Supabase SQL editor. The schema is additive and does not intentionally drop existing tables.
4. Configure Paystack webhook to `/api/payment/webhook`.
5. `npm run build`
6. Deploy to Vercel with the same environment variables.

## Required server secrets
`GEMINI_API_KEY` (or its `GOOGLE_API_KEY` compatibility alias), `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY` (for email features), and the owner configuration variables.

## Important
A successful frontend payment redirect never unlocks a plan by itself. Subscription and credits are granted by the verified Paystack webhook. Owner access is checked against the authenticated account and the server-side owner email.
## Bram assistant experience + usage analytics

This upgrade adds a personalized Bram opening state with the signed-in user's first name, a glowing Leo bubble, and quick actions for brainstorming, creating, deploying, fixing, and coding.

It also adds the `ai_usage` Supabase table. Chat requests record provider usage, while feature credit consumption records credits used. The owner admin dashboard polls the protected analytics endpoint every 5 seconds and shows total AI tokens, credits used, request count, per-feature usage, and recent usage.

Run the updated `supabase/schema.sql` in Supabase before using the analytics dashboard.



## Braverton client builder extensions
- `/setup` — 20-type onboarding wizard with automatic country/timezone/currency detection.
- `/setup/keys` — explains every public/secret integration key and why it is required.
- `/payment/manual` — Email manual payment request flow when the client explicitly chooses manual payment.
- Client-owned OpenAI keys are intended for deployed client chatbots; Leo's platform key is not used as the client's billing account.
- `hosting_subscriptions` tracks free trials and renewals; renewal automation requires a scheduled job/cron plus Resend/Paystack credentials.
- Google Search Console/GA4 automation is optional and requires Google API credentials; the app does not fabricate verification or analytics data.


## Braverton production integrations

- Client-builder deployments create/verify a Vercel project and production deployment before reporting success.
- Client environment variables are separated into public config and server secrets; secrets are never written to generated source.
- Hosting expiry creates a Vercel maintenance deployment and promotes it to production; verified Paystack renewal promotes the saved live deployment back.
- Google Search Console sitemap submission and GA4 reporting are available through owner-protected API routes when a Google service account is authorized for the relevant properties.
- Client chatbot knowledge, chat history, and SEO settings have persistent Supabase storage and owner/project access controls.
- AI usage analytics include daily, weekly, monthly, user, project, feature, input/output/total token and optional provider-rate-based cost calculations.
- Generated sites are validated for required admin/SEO files before deployment.

### External credentials

Configure only the credentials you actually use. Google credentials must be a server-side service account JSON with access granted to the relevant Search Console property and/or GA4 property. Never put Google service-account JSON or other secrets in `NEXT_PUBLIC_*` variables.


## Legal, global Leo access, demos, memory and trusted devices

- `/privacy`, `/terms` and `/refund-policy` are linked from the global footer and included in the sitemap.
- The Privacy and Terms pages describe account data, Leo chat/memory, payments, website services, security and user responsibilities. They should receive a jurisdiction-specific legal review before launch.
- A global Leo launcher is available on public pages and opens a compact chat panel; `/app` remains the full Leo workspace.
- The project library presents the 12 named LeoOS demo projects from the Big 12 set with curated Unsplash image URLs. A real project is labelled live only when its deployed URL is configured.
- Signed-in Leo chats are persisted per user in `chats_v2`. User-approved memories are stored separately in `leo_memories` and can be listed or removed through `/api/memory`.
- Owner admin 2FA now supports trusted-device cookies. After a successful authenticator verification, the current browser is trusted for up to 365 days for up to 365 days; a new/unrecognized browser must provide the authenticator code.

## Authentication and public access
- The public website does not require an account just to enter or browse it.
- Account creation/login is available from `/account` and `/auth`.
- Authentication uses Supabase and persists the signed-in session on the device; passwords are never stored by the application.
- Server APIs accept the authenticated Supabase access token and the secure LEO auth cookie.
- Chat history and user-approved Leo memories are stored per authenticated user.

## Project URL configuration
The 12 project entries are demo records in this LeoOS application, not twelve separate application codebases. Their real source projects are not embedded in this ZIP. A project is only labelled `live` when its real URL is configured. Set the corresponding `NEXT_PUBLIC_PROJECT_*_URL` variable in the deployment environment to connect each real deployed project. Until then the entry is labelled as a demo or awaiting a live URL, not presented as a real deployment.

Live projects use:
- `NEXT_PUBLIC_LIVE_QVELI_URL`
- `NEXT_PUBLIC_LIVE_LEONARDX_URL`

The 12 project URL variables are listed in `.env.example`.

## Verification note
A complete production `npm run build` was not run in this environment because the dependency registry was unavailable and `node_modules` is intentionally not included in the ZIP. The source was statically audited and several broken integrations were corrected, but deployment should still run `npm ci && npm run build` in an environment with registry access before production release.

## Provider setup
Gemini, GitHub, Vercel, Supabase, Paystack, Resend and optional provider credentials are represented by server-side environment variables. The app never puts provider secrets in NEXT_PUBLIC variables. A provider must have a real credential/endpoint configured before its corresponding owner-only agent can execute external actions.

## Google Video Generation

LeonardX uses a server-side Google Veo adapter for asynchronous text-to-video generation. Jobs reuse the existing authenticated generation-job, platform-credit, and private Supabase media-storage systems. Google Flow does not expose a verified public generation API in this integration; any future Flow browser/MCP connection must be clearly identified as unofficial automation and separately authorized. Image-to-video, multi-scene project assembly, and avatar clips are not enabled in the current adapter.

Required server environment variables:

```env
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_VIDEO_OUTPUT_GCS_URI=gs://your-video-output-bucket/leonardx/
LEO_GOOGLE_VIDEO_MODEL=veo-3.1-generate-001
GOOGLE_VEO_PLATFORM_CREDITS_PER_SECOND=
```


## Google sign-in and MCP

### Developer Agent Studio

Paid Developer API plans (Builder, Growth, Scale, and contracted Enterprise) include a private Agent Studio at `/developers/agents`. Custom agents store user-authored instructions and may only use tools already connected to that account and approved as read-only. Custom URLs, credentials, write-capable tools, and executable uploads are not supported. Apply `supabase/migrations/20261014120000_developer_custom_agents.sql` before enabling this feature.

### Google sign-in

Google sign-in is initiated from `/auth` and returns through `/auth/callback`. To enable it:

1. In Supabase, enable **Google** under **Authentication → Providers** and enter the Google OAuth client ID and secret.
2. In Google Cloud Console, add Supabase's displayed callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI.
3. In Supabase **Authentication → URL Configuration**, allow the deployed app callback, such as `https://leoos-omega.vercel.app/auth/callback`. Add any local or preview callback URLs you actually use.
4. Keep the Google client secret in Supabase/provider configuration; do not add it to a `NEXT_PUBLIC_*` variable.

The app verifies the returned Supabase session before setting its secure authentication cookies. If Google is not enabled in Supabase, the Google button cannot complete sign-in.

### Braverton MCP connection

The deployed Streamable HTTP endpoint is `https://leoos-omega.vercel.app/mcp`. Clients authenticate through LeonardX's OAuth 2.1 authorization-code flow with PKCE; do not create or share API keys. The initial authorization can grant read-only access. Approving `mcp:write` additionally exposes project creation/rename, source-file saving, and plan-limited build/deploy tools. Reconnect an existing MCP client to review and grant the write scope.

Claude, ChatGPT, or another connected model supplies its own model inference; these MCP tools do not call Leo AI or consume Leo AI credits. Every write tool requires `confirm: true` and client-side user approval. Build/deploy starts the existing no-cost hosting trial; after the trial, the site may be suspended unless hosting is renewed through the LeonardX account flow. MCP cannot make payments or renew hosting. Project deletion is not available.

For production, configure `MCP_PUBLIC_URL` to the HTTPS origin only, such as `https://leoos-omega.vercel.app` (no `/mcp` path). Leave `MCP_ALLOWED_ORIGINS` blank for server-to-server clients; browser MCP clients that send an `Origin` header need their exact HTTPS origins, comma-separated. External-model project deployments require `GITHUB_TOKEN` and `VERCEL_TOKEN`; they do not require `OPENAI_API_KEY` for inference. Apply the MCP OAuth, rate-limit, and `20261018180000_build_deploy_idempotency.sql` Supabase migrations before enabling deployment admission, and verify the deployment's OAuth metadata at `/.well-known/oauth-authorization-server`. `LEO_BUILD_DEPLOY_LIMIT_PER_HOUR` sets the per-account cap for distinct new builds; duplicate retries do not consume another slot.

### Contact requests

The `/contact` form saves requests to the existing Supabase `contacts` table through `/api/contact`. Configure Supabase and apply the contacts table/policies in `supabase/schema.sql` before accepting production submissions. Email notifications are optional; configure authenticated SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) or Resend (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`), plus `CONTACT_EMAIL` or `OWNER_EMAIL` as the destination. If database persistence is unavailable, the form reports an error rather than showing a false success.

### Website audits

The audit page runs Google PageSpeed Insights Lighthouse reports for both mobile and desktop. Configure `PAGESPEED_INSIGHTS_API_KEY` as a server-only deployment variable, with the PageSpeed Insights API enabled in Google Cloud, to improve production quota reliability. Do not use a `NEXT_PUBLIC_` variable for this key.

### Platform owner Developer API access

The configured platform owner (`OWNER_EMAIL` plus the matching owner role in the user's profile) can use product features and Developer API access without a paid subscription, project/build/image plan quotas, or Developer API credits. Owner API requests still pass API-key authentication, tool scopes, audit logging, and the API rate-limit service; no payment or subscription record is fabricated.


## Customer-owned integrations and custom domains

See [`LEONARDX_CUSTOMER_CONNECTIONS_AND_DOMAIN_MANAGEMENT.md`](./LEONARDX_CUSTOMER_CONNECTIONS_AND_DOMAIN_MANAGEMENT.md) for the new encrypted per-user integration registry, GitHub/Vercel account-aware builds, custom-domain management, rollout steps, and explicit provider capability boundaries. Apply the new Supabase migration and configure `MCP_CREDENTIAL_ENCRYPTION_KEY` before using customer-owned credentials.
## Standalone research

Leo's Web Search action uses the authenticated `/api/research` endpoint. It grounds answers with configured Gemini Google Search and can fetch up to five explicitly supplied public URLs through the DNS-pinned safe-site fetcher. Reports return source URLs and save owner-scoped history. Apply `supabase/migrations/20261111160000_research_reports.sql`; configure server-only `GEMINI_API_KEY` or `GOOGLE_API_KEY`. See [`LEONARDX_PRODUCTION_READINESS_20261111.md`](./reports/LEONARDX_PRODUCTION_READINESS_20261111.md) for verified boundaries and remaining deployment work.

## Skills

Leo skills live in `skills/<name>/SKILL.md` with optional `scripts/`, `references/`, and `assets/` folders. User skills can be created or imported as a ZIP from **App → Customize → Skills**, edited with semantic version updates, enabled/disabled, exported, and inspected through version and execution history. Skill ZIPs require a `.leonardx-skill.json` manifest and one directory matching the skill name. Supported paths are limited to `SKILL.md`, `scripts/`, `references/`, and `assets/`; packages are capped at 8 MB and 100 supporting files.

Apply `supabase/migrations/20261026200000_skills.sql`, `supabase/migrations/20261111150000_skill_versions_and_executions.sql`, and `supabase/migrations/20261115190000_private_runtime_jobs.sql` before using the user skill lifecycle. Skill scripts remain restricted to user-owned, enabled skills and require explicit confirmation. Approved scripts are queued on the separate private `LEOOS-RUNTIME` GitHub Actions repository, which must have the `LEONARDX_BASE_URL` and `CRON_SECRET` Actions secrets configured. Jobs run on ephemeral GitHub-hosted runners; they are not persistent terminals or a self-managed Podman/gVisor sandbox.


## Bram hands-free voice conversation

The authenticated `POST /api/realtime/session` endpoint initializes the server-orchestrated voice session and returns the selected voice plus the `gemini_turn_based` mode. The browser does not receive a provider API key or a direct Gemini Live token.

During a voice session, the Braverton client keeps the microphone open, detects the end of each spoken turn using a short silence window, and submits the recording to the authenticated `POST /api/voice` endpoint. That endpoint:
- transcribes the audio with the configured server-side Gemini audio model;
- passes the transcript, recent conversation, user-approved memories, retrieved Braverton knowledge and permitted tools through the same server-side assistant orchestration used by chat;
- persists the user transcript and Bram's reply in the user's chat when a valid session ID is supplied;
- generates speech from Bram's reply and returns a structured JSON response containing `transcript`, `assistantReply`, and base64-encoded audio.

The client displays both sides of the conversation, plays Bram's answer, and automatically resumes listening after playback. Users end the session with **End Voice Chat**; they do not need to press a separate stop-speaking button after each utterance. Microphone permission, browser audio playback permission, Gemini audio model access, and the authenticated Supabase session are required.

Server configuration:
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) for transcription, assistant orchestration and speech generation.
- `LEO_GEMINI_AUDIO_MODEL` for audio transcription (defaults to `gemini-2.5-flash`).
- `LEO_GEMINI_TTS_MODEL` for speech generation (defaults to `gemini-2.5-flash-preview-tts`).

The voice session is handled by Braverton's authenticated server-side session and voice endpoints. Automatic speech detection keeps the conversation flowing without manual per-turn controls.


## BramChat website and GitHub execution

BramChat exposes an authenticated `web_research` tool for grounded web search and public-site reading. When a user supplies a website, research follows same-origin links within a bounded crawl (up to 12 pages and depth 2), respects discovered `robots.txt` disallow rules, uses the DNS-pinned public-site fetcher, and stores cited research reports under the signed-in user's account. This built-in crawler is read-only and fetches public HTML; JavaScript-heavy, authenticated, or blocked pages may require a connected browser-capable MCP provider.

Remote MCP tools now have separate per-tool **Read only** and **Write access** approvals. Read tools are available for research when approved. Write-capable tools are exposed in BramChat only when the current user message explicitly requests a website action, the individual tool has been approved for write access, and the tool call includes `confirm=true`. Write tools are not delegated to specialist agents. Before payment, checkout, purchase, or final form submission, Bram must show the exact details and obtain the user's separate explicit confirmation. Apply `supabase/migrations/20261118100000_mcp_remote_tool_write_access.sql` before enabling the new access-level controls. Remote MCP hostnames must remain in the operator allowlist and credentials are encrypted at rest.

The connected GitHub integration exposes repository creation, branch creation, file creation/update, repository-tree and file reading, commit status, and atomic multi-file commits. Operations use the signed-in user's own GitHub integration credential. Repository, branch, and file writes require an explicit user request and `confirm=true`; secret and environment files remain blocked. Connect GitHub in the user's Integrations settings and grant the required GitHub App/OAuth repository permissions.
