# LeonardX Founders, Donation Centre, and LeoCode Implementation Report

## Scope and evidence

This report records repository findings and the additive implementation for the Founders Early Access programme, Donation Centre, and native VS Code extension. It does not claim that a database migration, payment transaction, deployment, scheduled job, or Marketplace release has been run.

The application is a Next.js App Router project backed by Supabase. Server routes use the helpers in [`lib/auth.ts`](../lib/auth.ts): authenticated profile lookup accepts bearer tokens or platform cookies, while administrative data access uses a server-side service-role client. Existing plan-aware specialist-agent APIs and the Leo chat API are reused rather than replaced.

The existing chat route is [`app/api/chat/route.ts`](../app/api/chat/route.ts). It returns a completed response rather than a token stream and uses server-controlled provider/model routing. The model catalog now offers five LEO-branded configurations backed by distinct Google Gemini IDs. The upstream IDs are cross-checked against the [official Gemini models catalog](https://ai.google.dev/gemini-api/docs/models); runtime access for the configured server key has not been live-probed.

The existing agent endpoints are [`app/api/agents/route.ts`](../app/api/agents/route.ts) and [`app/api/agents/run/route.ts`](../app/api/agents/run/route.ts). They filter agents by account plan and perform authorization server-side; the extension uses those endpoints and does not make authorization decisions locally.

## Implemented

- Added invitation, redemption, 60-day entitlement, and donation tables and restricted self-read policies in [`supabase/migrations/20261104130000_leocode_founders_and_donations.sql`](../supabase/migrations/20261104130000_leocode_founders_and_donations.sql). Redemption is an atomic service-role-only function that checks verified account email, invitation status, expiry, capacity, and duplicate use.
- Added invitation issuance, redemption, status, and expiry handlers. Invitation codes use 64 bits of cryptographic randomness, are stored as SHA-256 hashes, and are shown only on issuance. Redemption is rate-limited per account and IP.
- Added Paystack donation initialization and verification. Donation records remain pending until provider verification confirms reference, amount, currency, email, and metadata. The existing signed webhook updates donation success, failure, and refund state; duplicate success handling is atomic.
- Added public donation and early-access pages and owner dashboards for donation reporting and invitation management. Donation totals come from confirmed records; CSV export escapes spreadsheet formula prefixes.
- Added an additive bearer-authenticated account endpoint at [`app/api/auth/profile/route.ts`](../app/api/auth/profile/route.ts) for the VS Code extension. It returns only the account ID and email.
- Added the VS Code extension source at [`extensions/leocode/`](../extensions/leocode/). It uses VS Code SecretStorage for session tokens, bounded active-editor context with common credential exclusions/redactions, the existing chat and plan-filtered agent APIs, tool mode, workspace inventory, usage reporting, and explicit diff review before applying edits. README documents that redaction is best-effort.
- Added five distinct Gemini-backed LEO model choices in [`lib/ai/model-catalog.ts`](../lib/ai/model-catalog.ts), surfaced in LeonardX chat and the extension model selector. A server-side rolling 24-hour quota of 40 chat/sandbox requests is enforced for active Founders entitlements using the existing atomic rate-limit RPC; no additional database migration is needed for the counter.
- Hardened and integrated the separate isolated runner. Sandbox API requests require an authenticated active Founders entitlement, are rate-limited, signed server-to-runner with HMAC, and scoped to the authenticated user UUID. The runner now requires gVisor `runsc`, disables networking, and separates persistent workspaces by tenant. Patch operations require explicit confirmation.

## Not implemented or not verified

- **The isolated runner is not deployed or executed in this environment.** Docker/Podman and `runsc` are unavailable; dedicated VM, private networking, reverse proxy/mTLS, offline dependency cache, and runtime verification remain deployment prerequisites. No sandbox execution is claimed as operational.
- **Provider-key live verification is unavailable.** No Gemini key was available in the active environment, and no provider API calls were made. The five upstream model IDs are documented and code-tested, but access for a specific provider key must be verified by an authorized staging run.
- **Quota checks require the Founders schema to exist.** The database migration was not applied. Until it is applied, Founders access and sandbox execution stay unavailable and the existing chat continues without a Founders quota. After schema availability, the 40-request rolling 24-hour quota is enforced through the existing rate-limit RPC.
- **Entitlement expiry is not scheduled in Vercel.** The expiry endpoint is protected by `CRON_SECRET`, but no new Vercel Cron entry was added because the repository's existing schedule test requires its current six schedules. Access status still checks expiry against server time; persisted status changes and notifications require an authorized scheduler/operator to invoke the expiry endpoint.
- **The Supabase migration has not been applied or tested against a staging database.** Database RLS/RPC behavior has only been inspected in source; concurrency and policy behavior still need non-production integration tests.
- **Paystack checkout and webhooks have not been exercised with test credentials.** No live or test transaction was initiated.
- **The extension has not been run in a VS Code Extension Development Host or tested against a staging LeonardX account.** Its TypeScript compile passes, but chat, token refresh, workspace privacy behavior, model access, and agent approvals have not had an end-to-end account test.
- **A staging run is blocked by missing configuration.** `LEONARDX_STAGING_URL`, private runner URL/HMAC configuration, and provider credentials were not present; the read-only staging smoke script reports checks as blocked rather than contacting production.
- **No VS Code Marketplace package or publication was produced.** The manifest intentionally has no publisher ID because the repository does not establish an authorized publisher identity.
- The broader requested engineering environment and administrative/security dashboard remain separate work.

## Verification

- Focused invitation/payment/entitlement/model and Android worker tests pass: 31/31. Isolated runner unit tests pass: 8/8. LeoCode extension TypeScript compilation passes.
- Targeted ESLint passes with two existing warnings in `components/LEOWidget.tsx` (an effect dependency and an internal `window.location.href` navigation).
- The full Node test command previously ran 381 tests: 360 passed and 19 failed in unrelated existing areas, including AdSense configuration, build/deploy and chat source expectations, MCP diagnostics, and a live SEO audit.
- **Production build:** Next.js production compilation and `runAfterProductionCompile` completed. `next build` then failed in the TypeScript phase on pre-existing errors in browser agents, build/deploy, game generation, game-studio UI, integration status, SEO, and GitHub App auth. It reported no diagnostics in the files changed for this continuation, and no production build manifest was emitted.
- **Staging smoke:** `npm run test:staging` exited before making network requests because `LEONARDX_STAGING_URL` is unset. No end-to-end staging run could be performed in this environment.
- No migration push, deployment, transaction, or Marketplace action was performed.
