# LeonardX repository audit and repair report

## Scope and evidence
- Inspected the supplied `LEOOS-main.zip` (1,249 archive entries; 67 existing `.mjs` test files). The archive does not contain `.git` metadata or `node_modules`, so a reliable Git diff/status and dependency-backed TypeScript/lint/build checks are unavailable from this snapshot.
- Baseline full test run: **296 tests, 266 passed, 28 failed, 2 skipped**. After the workspace repair and three new tests: **299 tests, 269 passed, 28 failed, 2 skipped**. The 28 failures were not suppressed.
- Verified the official Google Gemini model catalog: `gemini-3.8-flash` is listed as a stable model. This confirms the identifier exists in the public API catalog, but does not verify this project's key, quota, region/access, or live runtime availability.

## Prioritized TODO inventory

### P0 — production/security/data integrity
1. **Credit-ledger and image-generation failure paths — `tests/ai-studio.test.mjs`, image generation implementation, credit RPC migrations.** Test failure: `studio image edit is authenticated, rate limited, persists private assets, and refunds failures`. Inspect the assertion and the matching RPC/migration contract; verify reservation, settlement, and refund against a test database before changing behavior. **Status: unresolved; requires deeper code/RPC verification.**
2. **MCP protocol / execution contracts — `tests/mcp-protocol.test.mjs`, `app/api/mcp/**`, MCP gateway and tool registry.** The test module fails before or during its assertions; exact failure details are in the full test output. Need isolate import/dependency failures from protocol defects and then exercise valid, invalid, unauthorized, timeout, and tool-failure paths. **Status: unresolved; no production MCP call or live Supabase check performed.**
3. **Migration parity / tenant isolation — `supabase/migrations/**`, RLS policies, RPCs.** ZIP alone cannot establish the remote migration history or schema parity. Do not apply the reported MCP migration or any production migration from this snapshot. **Status: externally blocked pending read-only remote migration/schema comparison.**

### P1 — AI, MCP, messaging, builds
1. **Provider registry and fallback tests — `lib/ai/model-catalog.ts`, `lib/ai/provider-fallback.ts`, `tests/model-provider-registry.test.mjs`, `tests/provider-fallback.test.mjs`.** Current failures show a mismatch between test assumptions and current Gemini-first implementation, including explicit provider resolution, local-model preference, status inventory, fallback classification, and fallback selection. The implementation should be reconciled with product policy and supported provider contracts; assertions must not simply be deleted. **Status: unresolved; 18 related failures remain.**
2. **Expo artifact verification — `tests/expo-artifact.test.mjs`.** Failing test module; inspect actual build artifact validation and test fixture/import cause. No build service was called and no APK was produced. **Status: unresolved.**
3. **Messaging notification — `app/api/contact/route.ts`, `lib/contact-form.ts`.** Web3Forms 403 is reported by the user, but this repository snapshot does not establish the configured access key/domain/provider-side restrictions. Preserve stored leads; inspect safe response classification and retry idempotency. **Status: external configuration/runtime verification required.**
4. **Speech/voice — speech API routes, `app/api/realtime/session/route.ts`, `app/meeting-room/page.tsx`.** Real-time voice still has an OpenAI Realtime dependency; Gemini turn-based fallback is not equivalent to live audio. Do not claim full Gemini replacement without a supported audio implementation and successful integration tests. **Status: partially known, not live-verified.**
5. **Hush Android — repository/project configuration and GitHub Actions workers.** No live build logs, service entitlement, or APK artifact URL was verified from the archive. **Status: externally blocked; no build submitted.**

### P2 — workspace and product workflow
1. **Leo AI empty-state UX — `components/LEOWidget.tsx`.** Removed the welcome headline, five requested shortcut cards, additional quick-start chips, and visible model selector. The no-conversation composer is now centered and spacious; once a conversation exists, the composer remains docked at the bottom. Chat requests now defer model routing to the server. **Status: implemented; three focused source-level regression tests pass.**
2. **Durable agent teams and daily reporting — workforce/agent queue routes, scheduler workflows, migrations.** Source includes queue and worker infrastructure, but live queue persistence, scheduler invocation, crash recovery, and daily report truthfulness cannot be verified without database and scheduler access. **Status: source-only; runtime verification pending.**
3. **Artifacts/private storage — artifact routes, `leo-files` bucket, ownership checks.** Must verify signed URLs, ownership/RLS, expiry and actual downloaded bytes in a configured environment. **Status: not live-verified.**
4. **Onboarding and conversation management.** Inspect existing APIs and account schema before expanding; this pass did not implement new onboarding fields or message edit/delete APIs. **Status: not completed.**

### P3 — SEO, docs, performance
1. **SEO and rendered metadata — `lib/seo.ts`, App Router layouts/pages, sitemap and robots routes.** Source tests are not a substitute for fetching rendered public HTML and verifying canonical, robots, Open Graph, sitemap and robots.txt behavior. **Status: not live-verified.**
2. **AdSense / Meta integration.** Do not insert a fabricated publisher ID, domain verification token, or tracking pixel. Confirm real account configuration and privacy/consent requirements before enabling. **Status: configuration-dependent.**
3. **`MaxListenersExceededWarning`.** The repository notes indicate this was not fixed by the previous retry update. A runtime `node --trace-warnings` reproduction and listener lifecycle trace are required; do not raise listener limits to mask the leak. **Status: unresolved.**

## Changes made in this pass
- `components/LEOWidget.tsx`: centered empty-state composer, removed the requested greeting/shortcut content and visible model selector; server-side model policy is retained.
- `tests/leo-workspace-layout.test.mjs`: added three regression tests for the new empty-state layout, hidden model selector/server routing, and bottom-docked conversation composer.

## Validation
- Focused tests: **3 passed, 0 failed**.
- Full suite after changes: **299 total; 269 passed, 28 failed, 2 skipped**. Existing failure groups: AI Studio image edit, API usage ledger, Expo artifact, MCP protocol, provider registry/fallback, plugins, and Vercel deployment URL.
- TypeScript, lint and production build: **not run** because `node_modules` is absent from the uploaded archive. The repository's scripts require installed dependencies; installing dependencies and completing checks must happen before any deployment.
- No database migration, external API call, paid build, deployment, commit, or push was performed.

## Next execution order
1. Restore dependencies with the repository lockfile (`npm ci`) in a controlled environment, then capture exact failure output for the non-provider test modules.
2. Resolve provider-registry/fallback policy and tests together, including current model allowlisting, safe diagnostics, and local-model preference if explicitly configured.
3. Trace credit reservation/refund and MCP protocol failures against test doubles first, then staging integration tests.
4. Verify Web3Forms and speech with safe provider diagnostics; never expose secrets.
5. Inspect Supabase migration history and RLS remotely in read-only mode before proposing any forward migration.
6. Verify Hush's actual configuration and build-service eligibility before requesting an APK build.
7. Run typecheck, lint, the full test suite, then one final build only after the implementation phase is complete.
