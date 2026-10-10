# LEO OS — Reliability Implementation Plan

Audit baseline: 2026-10-10  
Repository branch: `codex/leonardx-readiness-20261010`  
Main relationship: `origin/main` was an ancestor of the current branch at audit time. The working tree contains the earlier Integration Studio changes and reports; those must be preserved in the requested main-branch push.

## Findings

- Next.js `16.3.6`, React `19.1.0`, App Router, `npm` with `package-lock.json`, Vercel deployment configuration.
- Existing monitoring is limited to `@vercel/analytics`; `@sentry/nextjs` and `@vercel/speed-insights` are not installed. No Sentry DSN, Sentry build token, or Sentry project settings are present in the checked environment files or process environment.
- `/status` reports whether provider configuration is present, not provider uptime. No public liveness endpoint exists.
- API-key routes have request IDs and database usage logging. Application flows use scattered `console.error`; the chat catch currently writes the complete error object and returns raw error messages. Payment webhook logs include a transaction reference and raw exception message.
- The admin overview API is protected by platform-owner authorization and 2FA/trusted-device checks. Its database-backed dashboard has no Sentry or Vercel operational data source. A monitoring dashboard needs provider credentials and a separately scoped backend integration; it is deferred rather than filled with estimates.
- The actual IDE is `/ide/[workspaceId]`: it reads and saves only the signed-in owner’s project files, with path/size validation; the terminal supports `help`, `ls`, `cat`, and `clear` only and does not execute shell code. The dashboard currently links project rows to `/templates`, so it does not offer a direct route to the IDE.
- The local CLI package exists at `packages/cli`; it is not a cloud execution or deployment runner. The plugin route supports listing metadata and owner-only registration, but `lib/plugins.ts` stores entries in a process-local Map and explicitly does not execute plugin code. There are no dedicated CLI, IDE guide, or plugin guide pages.
- Last full baseline verification on this same source tree: `npm run verify` passed; typecheck passed, lint had 0 errors and 12 unrelated warnings, 36 tests passed, and the production build generated 149 routes.

## Implementation plan

1. Add Sentry’s supported Next.js instrumentation for browser, Node and Edge runtimes, with opt-in DSNs, disabled-by-default PII, aggressively redacted request/error/breadcrumb data, low configurable tracing sampling, release/environment tags, and source-map upload only when the build token is configured.
2. Add one safe operational-event helper that uses validated correlation IDs and an allowlist of operation/status/provider fields. Instrument Leo, agent, build/deploy, and Paystack outcomes without logging prompts, files, API credentials, payment references, or provider exception text. Preserve payment verification and authorization behavior.
3. Add Vercel Speed Insights to the existing root layout at a configurable sample rate. Report dashboard collection as unverified until the project is enabled and a production deployment receives real users.
4. Add a dependency-free liveness endpoint with a generic response; do not make it query Supabase, call Leo, or expose configuration. Keep `/status` as a separate configuration-presence view.
5. Keep provider alert creation and owner dashboard metrics out of application code until an authorized Sentry/Vercel account integration is available. Document manual alert setup and the separate owner-dashboard phase.
6. Add `/cli`, `/ide`, and `/plugins` guides using real package/routes/registry contracts. Add explicit back navigation, an actual dashboard-to-IDE project link, and source-linked explanations. Reuse the walkthrough for clearly labeled, non-executing previews; do not imply deployment, code execution, persistent plugin installation, or live monitoring data.
7. Add tests for monitoring redaction, correlation IDs, health response privacy, and tool-page demo contracts. Run `npm run verify`, browser-check route navigation, controls, unauthenticated states, and mobile overflow.
8. Commit the completed tracked and untracked work, fetch `origin`, and push to `main` only as a normal fast-forward. Do not force-push, deploy, publish packages, or run migrations.

## External configuration required

- Sentry account/project for the Next.js app; set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (browser DSN), `SENTRY_TRACES_SAMPLE_RATE` and `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`.
- Optional Sentry source map upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` as server-side build secrets. Without them, source-map upload/readable production stack traces cannot be verified.
- Vercel Speed Insights must be enabled in the existing Vercel project, then redeployed. No secret is required for the package integration.
- Sentry issue/metric alerts and any external uptime monitor require manual configuration in their provider dashboards; this repository has no provider credentials to create or verify them.
