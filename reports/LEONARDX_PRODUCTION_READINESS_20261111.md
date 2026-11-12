# LeonardX Production Readiness — 2026-11-11

## Status key

- **IMPLEMENTED** — source code and the required application behavior are present.
- **TESTED** — relevant automated checks passed in this worktree.
- **INTEGRATED** — connected to the existing LeonardX UI, provider or service boundary.
- **PRODUCTION VERIFIED** — exercised against the deployed production system.
- **BLOCKED** — external configuration, infrastructure, migration or authorization remains necessary.

No production account, provider credential, deployed database, storage bucket, GitHub worker secret or production runtime was verified during this task. No migration was applied and no deployment was performed.

## Capability status

| Workstream | Status and evidence | Remaining blockers |
|---|---|---|
| Workspace exports | **IMPLEMENTED / TESTED / INTEGRATED.** Authenticated project owner route supports all saved files, one saved file or a selected directory; streamed ZIP; secret filtering and safe filenames; IDE download actions. Unit and ZIP integrity tests are in `tests/workspace-export.test.mjs`. | **PRODUCTION VERIFIED: no.** Export is bounded to existing editor capacity (250 files / 2 MB); larger projects need an asynchronous export service. No time-limited artifact links were added. |
| Skills bundles and history | **IMPLEMENTED / TESTED / INTEGRATED.** Validated ZIP import/export includes `SKILL.md`, supported references/assets/scripts and binary assets; owner-scoped version and execution history; create/edit/enable/disable/delete UI. Bundle round-trip tests pass in `tests/skill-bundle.test.mjs`. | **BLOCKED:** apply `20261111150000_skill_versions_and_executions.sql`; configure `LEO_SANDBOX_URL` and `LEO_SANDBOX_HMAC_SECRET`; run and verify the gVisor worker. Cancellation of an in-flight script is not wired end-to-end. MCP, agent-team and slash-command skill invocation are not completed. |
| Skill script isolation | **IMPLEMENTED:** API forwards explicit-consent requests to the existing external runner with tenant HMAC, bounded archive/input/output, no network and no application secrets in the script container. Runner supports a bounded Node script operation. **TESTED:** source-contract coverage. | **TESTED against live runner: no.** Docker/gVisor was not started; cancellation is missing; live sandbox reachability and resource enforcement remain unverified. |
| Standalone research | **IMPLEMENTED / INTEGRATED.** Authenticated endpoint uses existing Gemini Google Search grounding and DNS-pinned public HTML fetch; response carries real provider source URLs and reports distinguish findings/inferences/missing evidence. Leo web-search action uses the endpoint. | **BLOCKED:** apply `20261111160000_research_reports.sql`; configure Gemini credentials. **PRODUCTION VERIFIED: no.** Network fetching and live provider citations were not integration-tested; MCP research tool and explicit UI source cards are not complete. |
| Android builds | Existing durable queue, hosted worker, private APK storage, SHA-256/signature checks, authenticated download and calculator project remain implemented and covered by repository tests. | **BLOCKED:** generator still supports the calculator only; no generic native app/project generator, AAB output, live worker/toolchain or storage policy was verified. Existing deployment’s GitHub secrets/migrations/storage setup was not inspected remotely. |
| Leo voice chat | **IMPLEMENTED / INTEGRATED:** authenticated route mints a one-use, five-minute Gemini Live token constrained to the selected model and voice; browser streams microphone PCM and plays streamed Gemini audio. Long-lived Gemini credentials remain server-side; per-user token creation is rate-limited. | **LIVE-VERIFIED: no.** Gemini Live access, free/paid project tier, browser microphone and audio-device behavior were not exercised with a real credential. Gemini free-tier use is subject to Google's current limits and data-use terms; paid-tier use can incur charges. The separate meeting voice-agent route is still unimplemented. |
| Ecosystem integration | Workspace downloads connect to the IDE; skills connect to workspace customization; research is invoked from Leo’s web-search action; existing Android artifacts remain retrievable through the owner-authenticated route. | Research-to-MCP and skill-to-agent-team/Leo/MCP orchestration are incomplete. No production integration was verified. |

## Database and environment requirements

Apply migrations in order using the repository’s normal Supabase migration process:

1. `20261111150000_skill_versions_and_executions.sql`
2. `20261111160000_research_reports.sql`

New server variables:

- `LEO_SANDBOX_URL` — private HTTPS endpoint for the isolated skill runner (HTTP permitted only for local development).
- `LEO_SANDBOX_HMAC_SECRET` — shared HMAC key for authenticated calls to that runner.

Existing provider and infrastructure variables still apply; at minimum live Gemini research/voice needs `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Android requires the configured hosted worker, GitHub Actions secrets, Supabase migration and private artifact bucket/policies. Their production values and availability were not verified.

## Verification record

Baseline before changes: 412 tests total; 408 passed, 2 failed, 2 skipped. Two failures exposed tracked test source files consisting entirely of NUL bytes; both files were restored as meaningful security/architecture contract tests. The remaining failing test exposed a missing isolated-runner DELETE proxy, which was implemented.

Current verification before the Live voice update: `npm test` passes 424 tests, 0 fail, 2 skip (426 total); focused workstream tests pass 18/18; `npm run lint` exits 0 with 5 existing warnings; `npm run typecheck` passed with an 8 GB Node heap before the final agent-registry guard change. The optimized build compiled in 5.2 minutes, then failed while collecting `/api/agents/cancel` page data because the built-in SEO agent tuple omitted its category and instruction fields. That tuple is now repaired, malformed definitions now fail with the registry's validation error, and the registry-wide runtime test passes. The build was not restarted after this repair, as requested. The Live voice update has not been typechecked or tested against Gemini. The original 2 GB heap was insufficient for this repository's typecheck; use `NODE_OPTIONS=--max-old-space-size=8192` for local verification.

## Deployment blockers

- Migrations and private bucket/storage policies must be reviewed and applied by the platform owner.
- Live Gemini, runner, Android worker and production database credentials/infrastructure are not present in the verification environment.
- Run the runner against its actual container runtime, including cancellation and timeout behavior, before enabling user script execution.
- Implement generic Android generation and actual Realtime voice streaming before describing those capabilities as complete.
- Complete MCP/agent integrations for research and skills, then verify end-to-end workflows against a staging deployment.
