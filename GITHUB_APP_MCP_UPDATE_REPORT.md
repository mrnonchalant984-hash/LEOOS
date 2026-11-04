# LeonardX GitHub App MCP update report

## Summary

Implemented GitHub App authentication for the existing owner-only main website MCP inspection/write workflow. The implementation uses Node.js RSA-SHA256 signing to create a short-lived App JWT, exchanges it for an installation token via the GitHub REST API, requests the token scoped to the configured repository name, and caches it only while more than five minutes remain before expiration. Private keys support real PEM newlines and escaped `\\n` sequences. No secrets or tokens are logged.

When all three App variables are present, the App token is used for main website operations. If none are present, the existing verified owner GitHub integration remains the fallback. Partial configuration or App authentication failure fails closed and never falls back. The existing verified Vercel integration remains required.

## Changed files

1. `lib/mcp/github-app-auth.ts` — new JWT, App configuration validation, installation-token exchange/cache, sanitized errors, fallback resolver.
2. `lib/mcp/main-website.ts` — use App installation token for existing inspect and push functions; require exact Vercel-to-GitHub repository link verification during inspection as well as writes.
3. `app/mcp/route.ts` — owner-only status/write handlers select App or existing verified-user-token mode while preserving owner identity, Vercel integration, and write rate limit.
4. `.env.example` — added server-only App environment variables and setup notes.
5. `tests/github-app-auth.test.mjs` — JWT signature/claims, escaped newline, numeric IDs, partial configuration, repository-scoped token exchange, token cache refresh, sanitized failures, and fallback behavior.
6. `tests/main-website-mcp.test.mjs` — asserts App authentication wiring and existing owner/write/confirmation/stale-SHA/repository-link protections.
7. `README-GITHUB-APP-MCP.md` — App permissions, installation, environment configuration, security behavior, changed-file list, and validation instructions.

## Validation results

- Focused tests: **11 passed, 0 failed**.
- Node syntax checks on all changed TypeScript implementation files: **3 passed** (`lib/mcp/github-app-auth.ts`, `lib/mcp/main-website.ts`, `app/mcp/route.ts`).
- Full test suite: **288 passed, 4 failed, 2 skipped** (294 total). The four failing test files are `tests/expo-artifact.test.mjs`, `tests/mcp-protocol.test.mjs`, `tests/plugins.test.mjs`, and `tests/vercel-deployment-url.test.mjs`; each fails at module loading because dependencies are incomplete in the provided `node_modules` (`jszip`, `@modelcontextprotocol/sdk`, `zod`, and `undici`, respectively).
- TypeScript typecheck: **not run to completion**; the `next` executable is missing (`sh: next: not found`).
- ESLint: **not run to completion**; the `eslint` executable is missing (`sh: eslint: not found`).
- Production build: **not run to completion**; the `next` executable is missing (`sh: next: not found`).
- Live GitHub App installation, real repository access, Vercel integration, and production writes: **not tested**. Automated tests mock the GitHub REST API and do not perform production writes.

## GitHub and deployment status

No branch or commit was created, no push occurred, and no deployment was performed. The previously attempted connected GitHub write operation was rejected with HTTP 403 `Resource not accessible by integration`; per the requested safeguards, this permission-denied operation was not repeatedly retried. The updated project is provided as a local source ZIP.

## Required GitHub App setup

- Repository Contents: **Read and write**.
- Metadata: **Read-only**.
- Install the App on the account that owns the repository and select `mrnonchalant984-hash/LEOOS` (or the repository named in `LEO_MAIN_WEBSITE_REPOSITORY`). Creating an App alone does not install it.
- Set `GITHUB_APP_ID` to the numeric App ID, not the OAuth Client ID.
- Set `GITHUB_APP_INSTALLATION_ID` to the numeric installation ID.
- Set `GITHUB_APP_PRIVATE_KEY` as a server-only secret.
- Configure all three in Vercel Project Settings → Environment Variables for the applicable deployment environments. Never use `NEXT_PUBLIC_` names or commit the private key.

The package is not certified production-ready until dependencies can be installed and typecheck, lint, full tests, production build, and authenticated staging checks pass.
