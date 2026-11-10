# LeonardX / LEO OS Source Audit

Updated: 2026-10-29

This is a source-level audit of the local checkout, not a production-readiness certification.

## Coverage and evidence

- The checkout was on `main` at `9e2e513b74d4e4b16e5605945333a7cd50ac020e`. It matched the cached `origin/main` ref; remote freshness could not be established.
- Git inventory counted 968 tracked files, 194 API route handlers, 47 Supabase migrations, and 9 GitHub workflows. Counts are inventory metadata, not a claim that every tracked file received an individual code review.
- Reviewed high-impact surfaces included API and project creation/deployment flows, Gemini model selection and public API pricing, agents and MCP, the isolated runner, image/video/voice workflows, SQL migration patterns, VS Code extension wiring, CI/deployment configuration, and primary product documentation.
- The worktree contained pre-existing modified and untracked files. They were preserved; no cleanup or reset was performed.

## Verified findings and source fixes

- **Deployment status:** the v1 project deployment bridge previously treated any 2xx response as deployed, including queued HTTP 202 builds. It now requires HTTP 200, an explicit `deployed` status, and an HTTPS live URL before updating the source project or emitting `project.deployed`. A failed status write is surfaced separately.
- **Runner tenant contract:** the application did not include `tenant_id`, although the isolated runner requires it to scope workspaces. Both runner request paths now derive that field from the authenticated account, never the request body.
- **API project entitlements:** v1 project creation previously omitted the supported-type, plan-eligibility, and project-count checks already present in v2. The same checks now gate v1 creation, and OpenAPI describes the supported types and entitlement errors.
- **Gemini API defaults:** the CLI and OpenAPI advertised unsupported `gpt-4o-mini`, and `.env.example` declared `LEONARDX_API_MODELS` twice, ending with an empty value. Defaults and documentation now use `gemini-3.8-flash`, with a single explicit model setting.
- **LeoCode manifest:** the existing native agent and MCP language-model tools were registered in code but missing the corresponding VS Code manifest contributions. The agent and both tools are now contributed; the engine minimum is aligned with the native contribution set.
- **Grounded-source typing:** the pre-existing Gemini provider changes allowed a source URI to remain optional in the result type. The guard now narrows valid HTTP(S) URIs explicitly.

## Remaining source-level concerns

- The v1 deploy bridge and delegated build route each authenticate the same API key, so deployment requests appear to consume two per-key rate-limit checks. Removing that duplication needs a shared authenticated execution path and dedicated tests.
- Two timestamp-distinct MCP gateway migrations are identical after whitespace normalization. Their idempotent behavior limits risk, but migration history should be consolidated only through an approved migration process.
- Static SQL inventory found 102 distinct created table names with explicit RLS enable statements, 108 policy declarations, and 51 security-definer function definitions with fixed `search_path` settings. Twenty-seven created table names had no explicit `CREATE POLICY` declaration in the scanned SQL; these may be service-role-only and require table-by-table grant review. This scan does not prove policy correctness or production parity.
- The central model registry is Gemini-only. Invalid configured model IDs intentionally fall through to a configured default, as documented in the existing code; whether production should instead fail closed on stale configuration is a product/configuration decision.
- Image fallback can switch models after a primary failure without attributing the fallback in the immediate response. Credit accounting and private storage need staging verification.
- Realtime voice explicitly remains unavailable; browser/computer-use agents fail closed. Video generation is implemented through Runway, but provider access was not live-tested.

## External and production verification limits

- Checked local environment variable names were unset; secret values were not read. `.env` files were not inspected.
- The production homepage check failed at DNS/TLS transport. `/mcp` GET returned 405, and OAuth metadata advertised `mcp:read` and `mcp:write`; no authenticated MCP initialization or tool execution was attempted.
- Supabase production migration parity, live RLS isolation, runner deployment, provider credentials/model access, Marketplace/npm publication, and remote CI status remain unverified.
- No production deployment, migration, paid provider call, commit, or push was performed.

## Validation

- Targeted API/deployment/runner tests: 22 passed. LeoCode native-agent/MCP tests: 3 passed. The isolated-runner Python tests: 8 passed.
- All repository tests except the pre-existing untracked, NUL-filled `tests/agent-execution-architecture.test.mjs`: 392 tests, 390 passed, 0 failed, 2 skipped. The standard `npm test` glob includes that malformed file and cannot import it. A separate SEO-agent test assertion was whitespace-sensitive; it was corrected and its test file passes.
- Targeted TypeScript checking of the changed API/runner/model-registry dependency graph reported 0 diagnostics. The normal whole-repository check is blocked by NUL bytes in the pre-existing untracked `app/api/agents/diagnostics/route.ts`.
- ESLint passed on the implementation and test files changed in this pass. `git diff --check` passed on those files; a repository-wide check still reports pre-existing trailing whitespace in `Problems.txt`.
- A production build and live integration tests were not run.

This audit records verified source behavior and outstanding evidence gaps. It does not certify external services or the deployed product.
