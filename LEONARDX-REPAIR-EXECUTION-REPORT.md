# LeonardX repair execution report

**Date:** 2026-10-27  
**Source:** supplied `LEOOS-main` repository snapshot  
**Outcome:** Partial repair completed; release validation is blocked by dependency-registry connectivity and missing external project/runtime inputs.

## Changes applied in this snapshot

1. **Dependency-install resilience**
   - Added `.npmrc` with bounded registry retries, longer fetch timeout, fewer concurrent sockets, and disabled audit/fund network requests during clean installs.
   - `npm ci` still could not complete in this environment. The registry request returned `EAI_AGAIN` for `registry.npmjs.org`; a later attempt exited with npm's `Exit handler never called!`. This is an environment/network blocker, not evidence that the lockfile install succeeded.

2. **Gemini-first model routing**
   - Restored reviewed provider identifiers for the currently supported OpenAI, Anthropic, and Google model presets while keeping the default text model Gemini-first.
   - An explicitly configured local model remains an intentional opt-out. A stale/unsupported `LEO_CHAT_MODEL` falls back to `google/gemini-3.8-flash`; the execution boundary still checks whether the selected provider is actually configured before making provider calls.
   - Updated outdated tests that asserted OpenAI should be the default, or that Gemini image edits should use the OpenAI `images.edit` endpoint, to match the current Gemini-first product contract.
   - Targeted provider registry/fallback and image/API usage tests passed.

3. **Credit accounting and refunds**
   - Added forward migration `supabase/migrations/20261027130000_credit_reservation_refund_integrity.sql`.
   - The replacement RPCs reject a reservation retry with a different cost, require a matching reservation before refunding, require the refund amount to match the reservation, and enforce idempotent refund records under an account row lock.
   - Added a regression test for those migration contracts.
   - **Not applied to any database.** The remote migration history and schema were not available in this environment; compare the remote history and review the SQL before applying it.

4. **Voice upload hardening**
   - Added a 15 MB audio limit, supported audio MIME allowlist, content-length precheck, and a transcript length limit before processing a voice turn.
   - Provider calls were not exercised against the live Gemini key from this local environment.

5. **MCP/account and private artifact regression coverage**
   - Added source-level checks for hashed opaque MCP tokens, allowed origins, token-owner-scoped tool execution, per-owner Android/Expo artifact lookups, artifact expiry, checksum validation, and private/no-store downloads.
   - Existing MCP handlers consistently pass the authenticated token owner's ID into tool methods. End-to-end MCP protocol tests remain blocked because the MCP SDK package is missing from the partially installed `node_modules` tree.

6. **SEO source checks**
   - Existing metadata, JSON-LD, sitemap and robots source tests pass. The live homepage is publicly reachable. The live `robots.txt` and `sitemap.xml` could not be fetched by the available public-page reader, so their deployed HTTP responses are not independently verified here.
   - No AdSense publisher/client ID or AdSense integration exists in this repository snapshot. No publisher ID or verification token was fabricated; actual AdSense activation requires the owner's real publisher ID and account/domain approval.

## Validation evidence

- **Full Node test suite:** 302 total, **296 passed, 4 failed, 2 skipped**.
- The four failing test files fail during module loading because dependencies were not restored:
  - `tests/expo-artifact.test.mjs` — missing `jszip`.
  - `tests/mcp-protocol.test.mjs` — missing `@modelcontextprotocol/sdk`.
  - `tests/plugins.test.mjs` — missing `zod`.
  - `tests/vercel-deployment-url.test.mjs` — missing `undici`.
- **Focused critical tests:** 12 passed, 0 failed for credit-refund migration checks, MCP/tenant and private-artifact source checks, SEO metadata/sitemap/robots source checks, and agent queue/scheduler source checks.
- **Provider/image/API focused tests:** 38 passed, 0 failed.
- **Lint:** blocked — `eslint: not found`.
- **TypeScript/type generation:** blocked — `next: not found`.
- **Production build:** blocked — `next: not found`.
- **Migration naming audit:** 42 local migration files, valid timestamp names, no duplicate timestamp prefixes. This is a local-file audit only, not proof of remote migration parity.

## Read-only LeonardX production configuration check

The connected LeonardX deployment reported:

- Gemini `google/gemini-3.8-flash` configured.
- Required Supabase production variables present and marked valid; no missing required variables reported.
- `MCP_PUBLIC_URL`, MCP credential-encryption key, cron secret, GitHub token and Vercel token configured.
- Web3Forms, Resend and Paystack variables configured; SMTP host/user are present, but SMTP password/from are not configured. Resend is the configured mail fallback.
- Expo token configured.
- `ANDROID_HOSTED_WORKER_ENABLED` is not configured; live Android capability check reported Java, Gradle and Android SDK unavailable and `buildable=false`.
- The runtime agent catalog includes an SEO agent. This catalog listing does not prove that a specific agent run or scheduler invocation succeeded.

No secret values were retrieved or included in this report.

## Remaining blockers / not claimed complete

- **Hush Android:** no Hush project source, `app.json`, or `eas.json` exists in the supplied repository snapshot. The live deployment's native Android worker is disabled and its runtime lacks Java/Gradle/Android SDK. No APK build was submitted and no APK is claimed to exist. The actual Hush project repository/source is needed to repair its build configuration; do not spend a paid build allowance before reviewing its eligibility and configuration.
- **Daily reports:** a protected five-minute agent queue workflow and durable queue/lease/finalization infrastructure exist in source, but no dedicated daily-report route/job was found in this snapshot. The live scheduler's actual run history was not verified.
- **Live database parity:** no remote migration-history comparison, RLS exercise, or cross-account staging test was run. No migration was applied.
- **Live MCP execution, message delivery, speech, signed artifact downloads, and external provider fallback:** source-level protections and focused tests were checked, but real end-to-end calls were not completed here.
- **AdSense:** requires a real publisher/client ID and account approval; neither is present in the source snapshot.
- **No deployment, Git push, production migration, or paid Android build was performed.** The supplied ZIP contains no `.git` metadata, so a branch/commit diff against the remote repository could not be established.

## Recommended next validation sequence

1. Restore DNS/registry connectivity and run `npm ci` to completion using the checked-in `.npmrc` and `package-lock.json`.
2. Run `npm run verify` and fix any dependency-backed failures without removing assertions.
3. Run `npm run db:dry-run` against a dedicated staging Supabase project; compare remote migration history first, then test reservation/refund idempotency and cross-account RLS.
4. Run the authenticated MCP protocol and artifact-download integration suites against staging.
5. Validate Web3Forms/Resend and Gemini speech with real credentials without printing secrets.
6. Inspect the actual Hush repository and configure an eligible build worker before submitting any build.
7. Implement or locate the intended daily-report workflow and verify scheduler run history before claiming it is reliable.
8. Configure AdSense only after the owner supplies the real publisher ID and confirms account/domain approval.
