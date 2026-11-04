# LeonardX MCP — pre-push verification

This checklist is intentionally fail-closed. A missing service or credential must be reported as BLOCKED, never treated as a pass. Use a dedicated staging project and disposable test data. Do not run build-creating or deployment checks against production unless separately approved.

## 1. Install and run local checks

```bash
npm ci
npm run verify
```

`npm run verify` runs type generation/type checking, ESLint, the full Node test suite, and a Next.js production build. Fix all failures before continuing. Do not skip tests just to get a green result.

## 2. Configure staging-only values

Set these in the terminal environment or a local, untracked `.env.local` file (never paste values into chat or commit them):

- `LEONARDX_STAGING_URL`: HTTPS staging app origin, not the production URL.
- `LEONARDX_MCP_URL`: staging MCP endpoint, ending in `/mcp`.
- `LEONARDX_MCP_ACCESS_TOKEN`: short-lived staging MCP OAuth token with only `mcp:read` for the protocol smoke test.
- `REPOSITORY_RUNNER_URL`: authenticated isolated runner service origin.
- `GODOT_BUILD_SERVICE_URL`: Godot build service origin.
- All configuration required by `scripts/production-preflight.mjs`, populated with staging-only values and correctly scoped tokens.

Then run:

```bash
npm run verify:release
```

This runs the local verification suite, deployment configuration preflight, Supabase migration dry-run, staging health/readiness checks, MCP discovery/capability invocation, and runner/Godot health probes. It does not deploy, create projects, submit paid build jobs, or apply migrations.

## 3. Live acceptance tests that require a staging user and provider access

The release gate must not claim these are proven by health checks alone. Execute with two ordinary staging test accounts (A and B), a disposable project, and provider credentials that are explicitly approved for test usage:

1. **Persistence:** Account A creates a project through MCP; verify project record and files survive a new request/session and a worker restart. Retry the same request with the same idempotency key and verify there is no duplicate project.
2. **Tenant isolation:** Account B attempts to read, update, build, download, and delete A's project/artifact IDs. Every attempt must be denied without leaking data. Repeat with revoked/expired credentials.
3. **Durable workers:** Enqueue a non-destructive test job; verify claim, lease/heartbeat, stage persistence, retry cap, stale-lease recovery, and final status. Confirm scheduler logs show successful authenticated invocations and no overlapping claims.
4. **Android:** Submit an approved disposable Android project to the real configured worker. Confirm provider job ID, successful build exit status, APK magic/type, size and checksum, private storage, and authorized time-limited download. Verify B cannot download it.
5. **Godot:** Submit an approved disposable Godot project to the real build service. Confirm export preset, provider job ID, exit status, artifact existence/type/checksum, authorized download, and cross-account denial.
6. **Deployment:** Deploy only to staging through the configured provider; verify the returned URL belongs to the expected project, responds successfully, and serves the expected build. Do not infer deployment success from source generation.
7. **Provider failure:** In staging, use a deliberately invalid/non-billable provider configuration or a mocked adapter. Verify bounded timeout/retry, redacted diagnostics, stable correlation ID, no fake answer, and no automatic repeated expensive call.
8. **Secrets:** Inspect application, worker, and provider logs and MCP tool results for token/key/password values. Confirm all are redacted.

Record the exact command, timestamp, result, relevant non-secret job IDs/correlation IDs, and blocker for every item. Never include tokens, service-role keys, private URLs containing credentials, or customer data in the report.

## 4. Database migrations and production deployment

Review the dry-run output manually. Do not apply migrations automatically from this checklist. After staging acceptance and review, apply approved migrations using the existing authorized process. Production deployment and post-deploy health checks are a separate explicit step; this release gate does not deploy production.

## Report template

- `npm ci`: PASS / FAIL
- `npm run verify`: PASS / FAIL (attach command summary)
- `npm run preflight:production`: PASS / FAIL
- `npm run db:dry-run`: PASS / FAIL
- `npm run test:staging`: PASS / FAIL / BLOCKED
- `npm run test:mcp:external`: PASS / FAIL / BLOCKED
- `npm run test:live:services`: PASS / FAIL / BLOCKED
- Project persistence + idempotency: PASS / FAIL / BLOCKED
- Cross-account access tests: PASS / FAIL / BLOCKED
- Durable scheduler/worker recovery: PASS / FAIL / BLOCKED
- Android artifact and download: PASS / FAIL / BLOCKED
- Godot artifact and download: PASS / FAIL / BLOCKED
- Staging deployment verification: PASS / FAIL / BLOCKED
- Provider failure + secret redaction: PASS / FAIL / BLOCKED
- Production deployed: NO (unless separately performed and verified)
