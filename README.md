# LEO Portfolio OS — Leo OS upgrade

This project uses the existing LEO Portfolio OS as its base and adds account-aware Leo OS functionality without replacing the existing portfolio pages or pricing page.

## Added/connected
- Owner/founder enforcement for `leonardudoh5@gmail.com` on the backend.
- Owner free access path and owner greeting.
- Supabase profiles, subscriptions, payments, credits, feature access, projects, admin logs, chat memory and notifications schema (additive migration).
- RLS policies and owner access helper.
- Paystack webhook verification with server-side signature validation and subscription/credit updates.
- Credit-gated image generation with owner bypass.
- `/dashboard` and owner-only `/admin`.
- TOTP 2FA setup for the owner admin path with backup codes.
- Full-screen ChatGPT-style LEO chat UI with voice input, suggestions, generated-image display and per-user chat persistence.
- 3D particle background and reusable glass-card styling.
- Blog, terms, privacy, refund-policy, sitemap and robots routes.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill the required values.
3. Run `supabase/schema.sql` in the Supabase SQL editor. It is designed as an additive upgrade and does not intentionally drop existing portfolio tables.
4. Configure Paystack webhook to `/api/payment/webhook`.
5. `npm run build`
6. Deploy to Vercel with the same environment variables.

## Required server secrets
`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY` (for email features), and the owner configuration variables.

## Important
A successful frontend payment redirect never unlocks a plan by itself. Subscription and credits are granted by the verified Paystack webhook. Owner access is checked against the authenticated account and the server-side owner email.
## Leo AI welcome + live admin usage analytics

This upgrade adds a personalized Leo AI opening state with the signed-in user's first name, a glowing Leo bubble, and quick actions for brainstorming, creating, deploying, fixing, and coding.

It also adds the `ai_usage` Supabase table. Chat requests record OpenAI prompt/completion/total tokens, while feature credit consumption records credits used. The owner admin dashboard polls the protected analytics endpoint every 5 seconds and shows total AI tokens, credits used, request count, per-feature usage, and recent usage.

Run the updated `supabase/schema.sql` in Supabase before using the analytics dashboard.



## Leo OS client builder extensions
- `/setup` — 20-type onboarding wizard with automatic country/timezone/currency detection.
- `/setup/keys` — explains every public/secret integration key and why it is required.
- `/payment/manual` — Email manual payment request flow when the client explicitly chooses manual payment.
- Client-owned OpenAI keys are intended for deployed client chatbots; Leo's platform key is not used as the client's billing account.
- `hosting_subscriptions` tracks free trials and renewals; renewal automation requires a scheduled job/cron plus Resend/Paystack credentials.
- Google Search Console/GA4 automation is optional and requires Google API credentials; the app does not fabricate verification or analytics data.


## LEO OS v2.0 production integrations

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
- The portfolio contains the 12 named demo projects from the Big 12 set with curated Unsplash image URLs. Real project/live URLs can be supplied later without replacing the preview images.
- Signed-in Leo chats are persisted per user in `chats_v2`. User-approved memories are stored separately in `leo_memories` and can be listed or removed through `/api/memory`.
- Owner admin 2FA now supports trusted-device cookies. After a successful authenticator verification, the current browser is trusted for up to 365 days for up to 365 days; a new/unrecognized browser must provide the authenticator code.

## Authentication and public access
- The public website does not require an account just to enter or browse it.
- Account creation/login is available from `/account` and `/auth`.
- Authentication uses Supabase and persists the signed-in session on the device; passwords are never stored by the application.
- Server APIs accept the authenticated Supabase access token and the secure LEO auth cookie.
- Chat history and user-approved Leo memories are stored per authenticated user.

## Project URL configuration
The 12 portfolio entries are portfolio records in this LEO OS ZIP, not twelve separate application codebases. Their real source projects are not embedded in this ZIP. A project is only labelled `live` when its real URL is configured. Set the corresponding `NEXT_PUBLIC_PROJECT_*_URL` variable in the deployment environment to connect each real deployed project. Until then the entry is labelled `awaiting URL` rather than being presented as a fake live site.

Live projects use:
- `NEXT_PUBLIC_LIVE_QVELI_URL`
- `NEXT_PUBLIC_LIVE_LEONARDX_URL`

The 12 project URL variables are listed in `.env.example`.

## Verification note
A complete production `npm run build` was not run in this environment because the dependency registry was unavailable and `node_modules` is intentionally not included in the ZIP. The source was statically audited and several broken integrations were corrected, but deployment should still run `npm ci && npm run build` in an environment with registry access before production release.

## Provider setup
OpenAI, GitHub, Vercel, Supabase, Paystack, Resend and optional browser/computer/3D provider credentials are represented by server-side environment variables. The app never puts provider secrets in NEXT_PUBLIC variables. A provider must have a real credential/endpoint configured before its corresponding owner-only agent can execute external actions.

## Owner Video Agent

LEO OS includes an owner-only Video Agent powered by Runway Dev. GPT-6 Astra remains the reasoning/orchestration layer; Runway performs the actual video generation. The agent requires explicit owner approval because generation consumes provider credits. Generated videos are copied into the existing private `leo-files` Supabase Storage bucket when possible because Runway result URLs are temporary.

Required server environment variables:

```env
RUNWAYML_API_SECRET=
RUNWAY_VIDEO_MODEL=gen4.5
RUNWAY_VIDEO_TIMEOUT_MS=540000
```

The Video Agent is not available to normal users.
