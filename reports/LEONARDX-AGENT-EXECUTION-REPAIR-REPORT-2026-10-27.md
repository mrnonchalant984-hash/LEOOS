# LeonardX Agent Execution & SEO Reliability Repair Report

**Date:** 2026-10-27  
**Repository baseline:** `mrnonchalant984-hash/LEOOS`, default branch source inspected read-only  
**Production deployment:** Not performed  
**Database migrations:** None applied  
**Paid provider calls:** None intentionally triggered  
**Pull request:** Not created; GitHub connector returned 403 when attempting to create a branch (`Resource not accessible by integration`).

## 1. Executive summary

The reported SEO error was reproduced from persisted run history: two SEO runs on 2026-10-27 failed within roughly 0.3–0.4 seconds and stored only `Agent execution failed. Review provider configuration and retry.` The exact provider exception is **unresolved** because the existing MCP catch swallowed it and persisted a generic message. This is not enough evidence to blame an API key.

The source review found additional confirmed defects and repaired them in this local patch:

1. The SEO Agent was a generic text prompt despite advertising web search and file tools. It had no actual website fetch, sitemap/robots inspection, or repository tool execution in `runAgent`.
2. Agent model selection could take raw `LEO_AGENT_MODEL` from the registry without validating it before fallback selection. An invalid value could throw before the fallback wrapper ran.
3. The provider retry classifier considered authentication/authorization failures (401/403) and missing models (404) retryable, contrary to the requested failure policy.
4. The default alternate for Gemini 3.8 was Gemini 2.5 Flash. Google’s current model documentation notes access restrictions on Gemini 2.5 for some newer projects; Gemini 3.5 Flash-Lite is now the alternate when Gemini 3.8 is primary.
5. MCP agent failures discarded the `ModelProviderError` status/message and the outer MCP catch logged raw exception messages.

The patch adds a deterministic, read-only SEO executor using the existing DNS-pinned public-site fetch utility. It does not call a text provider for SEO audits. Unit tests pass, but the updated source is not deployed, and the production agent has not yet been executed after the repair.

## 2. Exact root cause status

**Incident trigger: UNRESOLVED.** The two failed production run records contain only the generic message. The code that handled the failure overwrote the original exception, so the actual provider status/model response is no longer available from those records.

**Confirmed defects related to the incident:**

- `app/mcp/route.ts` caught every SEO execution error and replaced it with a generic provider-configuration message. This prevented diagnosis and made different failures look identical.
- `lib/agents/manager.ts` used `agent.model` / `LEO_AGENT_MODEL` as a raw value before passing it into the fallback logic. Invalid model identifiers could fail before fallback handling.
- `lib/ai/provider-fallback.ts` treated 401, 403, and 404 as retryable. These are not transient failures and must not silently trigger a second provider call.
- The SEO agent’s `allowedTools` claimed `web_search`, `file_read`, and `file_write`, but its generic executor called `generateText` without tool definitions. Therefore it could not actually perform the advertised live search or file inspection.

These defects are repaired in the local patch. They are not proof that any one of them was the precise exception behind the historical production failure.

## 3. Changes made

| File | Change | Evidence / reason |
|---|---|---|
| `lib/agents/seo-audit.ts` | Added deterministic read-only SEO audit of the supplied public URL: HTTP status, title/description, canonical, robots directives, headings, internal links, image alt coverage, JSON-LD, OG/Twitter, robots.txt, sitemap URL count and AdSense tag presence. Performance/Search Console/repository checks are explicitly marked unmeasured/unavailable. | Fixes the confirmed SEO capability gap without requiring a paid text-provider call. |
| `lib/agents/manager.ts` | Routes the existing `seo` agent to the new audit executor; uses validated Gemini-first agent model selection for other text agents. | Prevents the SEO agent from being only a generic prompt; prevents stale model IDs from failing before fallback. |
| `lib/agents/registry.ts` | SEO agent now advertises only the implemented read-only `public_site_audit` capability and read permission. | Removes unsupported web-search/file-write claims. |
| `lib/ai/agent-model-selection.ts` | Added validated model selection, preserving explicit local endpoint use and supported Gemini overrides; invalid/non-Gemini `LEO_AGENT_MODEL` values fall back to the validated configured Gemini chat default. | Prevents raw invalid model configuration from bypassing validation. |
| `lib/ai/provider-fallback.ts` | Removed fallback retries for 401/403/404 and other non-retryable client errors; retained bounded fallback for timeout, rate limit, 5xx, and recognized transient network failures. Changed default alternate from Gemini 2.5 to Gemini 3.5 Flash-Lite when Gemini 3.8 is primary. | Matches the requested error policy and current official model availability guidance. |
| `app/mcp/route.ts` | Persists safe `ModelProviderError` diagnostics for failed agent runs and logs only event/type/status metadata rather than raw exception messages. | Makes the next failure actionable without logging credentials or provider payloads. |
| `lib/public-site-fetch.ts` | Generalized the existing DNS-pinned, redirect-revalidated fetch utility to support plain text/XML resources as well as HTML. | Allows safe robots.txt and sitemap.xml reads while retaining private-IP and redirect checks. |
| `tests/agent-model-selection.test.mjs` | Added tests for Gemini default, invalid/non-Gemini override handling, valid Gemini override and explicit local model. | Regression protection. |
| `tests/provider-fallback.test.mjs` | Added assertions that authentication, authorization, missing-model and malformed-request errors do not fall back. | Regression protection. |
| `tests/model-provider-registry.test.mjs` | Updated expected alternate model. | Regression protection. |
| `tests/one-click-gemini-upgrade.test.mjs` | Updated expected alternate model. | Regression protection. |
| `tests/seo-agent-live-audit.test.mjs` | Added deterministic SEO audit tests using mocked HTTP responses (no provider call). | Tests actual report structure and finding detection without billable API calls. |
| `tests/mcp-agent-error-diagnostics.test.mjs` | Added source-level regression tests for sanitized MCP diagnostics and the SEO executor route. | Protects the diagnostic and capability-dispatch fixes. |
| `reports/SEO-LIVE-AUDIT-2026-10-27.md` | Saved independent read-only live SEO observations and limitations. | Separates actual website observations from unverified agent execution. |
| `reports/AGENT-EXECUTION-INVENTORY-2026-10-27.md` | Inventoried all 62 registered built-in agents with mechanism, ownership/approval metadata, and status. | Makes capability mismatches explicit rather than assuming registry presence means operational execution. |

## 4. Agent inventory status

The inventory covers **62 registered agents**. Summary:

- **42 FAIL:** source-level mismatch between non-empty `allowedTools` metadata and the generic text executor, which does not inject those tools. This does not mean the prompt cannot produce text; it means the advertised tool operation is not wired into that executor.
- **19 NOT TESTED:** no individual live execution test was performed. Shared provider/fallback unit tests are not individual agent proof.
- **1 BLOCKED:** SEO Agent live production execution is blocked because the patched code has not been deployed and the local runtime could not resolve the production hostname. Its three deterministic unit tests passed.

The inventory explicitly preserves owner-only and approval-required flags. Image/video and browser/computer-use paths were not triggered because they require dedicated providers, approvals and/or potentially billable operations.

## 5. MCP protocol and authorization

- Source inspection confirms the endpoint uses Streamable HTTP, requires OAuth bearer-token validation, checks allowed origins, resolves the token’s user ID, applies plan/owner checks, and scopes agent run reads/writes by authenticated user ID.
- The MCP failure-path diagnostic tests pass.
- A full MCP protocol integration test is **BLOCKED**: `tests/mcp-protocol.test.mjs` cannot import `@modelcontextprotocol/sdk/client/index.js` because dependency installation did not complete.
- No live authenticated MCP initialization/discovery/invocation was run after the patch. Cross-account isolation and RLS require a staging two-account test.

## 6. Provider routing

- Connected production configuration reports `google/gemini-3.8-flash` configured. This establishes configuration presence only, not live model access, quota, or successful generation.
- The official Google model documentation lists `gemini-3.8-flash` and `gemini-3.5-flash-lite`; Gemini 2.5 access is restricted for some newer projects. The patch now uses Flash-Lite as the alternate when Gemini 3.8 is primary.
- Authentication/authorization/missing-model failures are no longer treated as transient fallback triggers. Transient timeout, rate-limit, server and recognized network failures can use the existing bounded Gemini fallback.
- No live provider call was made during testing, so live model access remains unverified.

## 7. Independent live SEO findings

See [`SEO-LIVE-AUDIT-2026-10-27.md`](./SEO-LIVE-AUDIT-2026-10-27.md) for detailed URL-by-URL evidence. Highlights:

- Homepage title/description, canonical, Open Graph, Twitter card, `index, follow`, Organization/WebSite JSON-LD and a visible H1 were observed.
- Live robots.txt allows public crawling, disallows `/api/`, and points to the sitemap.
- Live sitemap extraction reported 62 URLs; `/auth` and `/app` were not listed.
- `/auth` and `/app` were observed with `noindex, nofollow, noarchive`.
- `/pricing`, `/services`, `/blog` and `/projects` had page-specific titles/descriptions and canonical/social metadata.
- AdSense publisher metadata/script was not detected in repository search or returned head metadata. AdSense approval and eligibility are not established.
- HTTP status/redirect headers, Core Web Vitals, Lighthouse scores, Google Search Console data, and AdSense account status were not verified.

## 8. Test results

### Passed targeted tests

Command:

`node --experimental-strip-types --test tests/agent-model-selection.test.mjs tests/provider-fallback.test.mjs tests/model-provider-registry.test.mjs tests/one-click-gemini-upgrade.test.mjs tests/seo-agent-live-audit.test.mjs tests/mcp-agent-error-diagnostics.test.mjs tests/public-site-fetch.test.mjs tests/seo-foundation.test.mjs tests/agent-queue-scheduler.test.mjs tests/mcp-ai-agents.test.mjs`

Result: **53 passed, 0 failed, 0 skipped**.

### Blocked/failed verification

| Command | Result | Reason |
|---|---|---|
| `npm ci --ignore-scripts --prefer-offline --fetch-retries=1 --fetch-timeout=15000` | Timed out | Dependencies did not finish installing. |
| `npm ping --fetch-retries=0 --fetch-timeout=5000` | Failed, `EAI_AGAIN` | DNS lookup for `registry.npmjs.org` failed; dependency installation cannot be repaired from this network-isolated runtime. Existing `.npmrc` already has retries and long timeouts. |
| `npm test` | Timed out before completion, while processing the full suite (output had reached test group 127; no final summary) | Full suite result is incomplete and cannot be declared green. |
| `node --experimental-strip-types --test ... tests/mcp-protocol.test.mjs` (included in the broader targeted command) | Failed to load test module | `@modelcontextprotocol/sdk/client/index.js` is missing from the partial `node_modules`. |
| `npm run typecheck` | Blocked, exit 127 | `next: not found`. |
| `npm run lint` | Blocked, exit 127 | `eslint: not found`. |
| `npm run build` | Blocked, exit 127 | `next: not found`. |
| Local actual fetch through the new SEO executor | Blocked (`http_502`, “The website host could not be resolved.”) | This container’s DNS/network path could not resolve the public host. An independent external fetch service successfully returned the live page content for the separate SEO report. |

## 9. Security and regression

- The SEO executor uses the existing public-site fetch path, which validates HTTP/HTTPS URLs, rejects credentials/custom ports and private/local targets, pins a public DNS result, bounds response size/time, and revalidates redirects. The new robots/sitemap reads use the same protections.
- MCP logs now avoid raw exception messages. Provider errors returned to the caller are the application’s sanitized `ModelProviderError` messages; unexpected errors return a generic safe message.
- No authentication, plan restrictions, approval gates, rate limits, credit checks, or owner-only access controls were disabled.
- No production data was changed; no migration was applied; no deployment was performed.

## 10. Remaining blockers and exact next steps

1. Restore package registry access and complete `npm ci` in a network-enabled environment.
2. Run `npm run verify` and record the final complete result; separately resolve any genuine test/type/lint/build failures.
3. Deploy the patch only after explicit authorization, then invoke the SEO Agent through the authenticated MCP path. The deterministic audit should not call a text provider, but it must still be tested against the deployed runtime and persisted run result.
4. Run authenticated MCP initialize/list-tools/invoke tests with a real compatible client; verify per-account run isolation with two staging accounts.
5. Wire actual authorized tools into the other agents or remove unsupported `allowedTools` claims. Do not treat the 42 capability mismatches as resolved by the SEO-only repair.
6. Check the remote Supabase migration history/RLS policies and worker/scheduler status in staging; no live database inspection or migration was performed in this session.
7. Perform a real mobile/desktop PageSpeed/Lighthouse test and a Search Console review only if authorized access is connected. Configure AdSense only with the actual publisher ID after eligibility/approval.
8. The GitHub connector refused branch creation (403). Apply the local patch to a working clone or enable repository write access, review the diff, then create a PR. Do not deploy automatically.

## 11. Production readiness

**NOT READY for production acceptance.** The high-impact code defects described above are repaired in the local bundle and focused tests pass, but the complete test suite, TypeScript, lint, build, live MCP integration, production SEO-agent execution, database isolation and remaining agent-tool implementations are not yet verified. No production changes were made.
