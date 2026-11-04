# LeonardX GitHub App authentication for owner MCP website operations

This upgrade adds GitHub App JWT authentication and short-lived installation tokens to the existing `inspect_main_website` and `update_main_website` MCP tools. It does not replace the app's GitHub user integrations for other account-specific operations.

## GitHub App setup

1. Open GitHub Developer Settings and select the GitHub App used by LeonardX (or create one if none exists).
2. Set **Repository permissions** to:
   - **Contents: Read and write**
   - **Metadata: Read-only** (required by GitHub)
3. Save the permission changes. If GitHub prompts for installation permission approval, approve them.
4. Install the App on the account that owns the configured main website repository. Select **Only select repositories** and select `LEOOS` in `mrnonchalant984-hash` (or the exact repository configured in `LEO_MAIN_WEBSITE_REPOSITORY`). Creating an App does not install it or grant repository access.
5. Copy the numeric **App ID** from the App's General settings. Do not use the OAuth Client ID.
6. Generate/download a private key for that App. Store it only as a server-side secret.
7. Find the numeric **installation ID** for the installation that includes the target repository. Do not use the App ID or OAuth Client ID in this field.

The application requests an installation token scoped to the configured repository name, uses a short-lived App JWT to obtain it, and caches the installation token only until five minutes before its expiration. No credential or token is logged. App authentication failures are sanitized and do not fall back to a user token.

## Environment variables

Set these in local `.env.local` or the Vercel project's **Settings → Environment Variables**. Do not prefix them with `NEXT_PUBLIC_` and do not commit them.

```dotenv
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GITHUB_APP_INSTALLATION_ID=12345678
```

The app accepts escaped `\n` sequences or real newlines in the private key. Set all three variables together. If none are set, owner main-website MCP operations retain the existing verified GitHub integration fallback. If only some are set, operations fail closed rather than silently falling back.

Keep the existing variables configured:

```dotenv
LEO_MAIN_WEBSITE_REPOSITORY=mrnonchalant984-hash/LEOOS
LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID=leoos
```

The App replaces only the GitHub token for the owner-only main website MCP tools. The existing verified owner Vercel integration is still required by these MCP handlers; setting `VERCEL_TOKEN` alone does not replace that verified integration. Other account-specific GitHub connections remain unchanged.

## Safety guarantees retained

- Platform-owner authorization and owner/token identity check.
- MCP `mcp:write` scope and `confirm: true` for write tool invocation.
- Fresh expected main-branch commit SHA check.
- Existing write rate limit, file/path validation, secret scanning, workflow-file restrictions, Vercel repository-link verification, and non-force branch update.
- No production write is performed by automated tests.

## Files changed by this upgrade

- `lib/mcp/github-app-auth.ts` — new JWT, installation-token exchange, safe cache, configuration validation, and verified-user-token fallback resolver.
- `lib/mcp/main-website.ts` — uses the App installation token for existing inspect and push operations when the App is configured.
- `app/mcp/route.ts` — owner-only status/write handlers use App mode without requiring a stored GitHub user token, while retaining verified Vercel integration and fallback behavior.
- `.env.example` — documents the three server-side App variables and required permissions.
- `tests/github-app-auth.test.mjs` — JWT signature, partial config, token exchange/cache, sanitized failures, and fallback tests.
- `tests/main-website-mcp.test.mjs` — verifies MCP owner/write confirmation protections and App-token wiring.
- `README-GITHUB-APP-MCP.md` — this setup and changed-files guide.

## Validation

The current repair report is in `GITHUB_APP_MCP_UPDATE_REPORT.md`. In the provided environment, the focused tests passed, but full-suite/build validation remains blocked by missing installed packages.

Run the focused tests with:

```bash
node --experimental-strip-types --test tests/github-app-auth.test.mjs tests/main-website-mcp.test.mjs
```

Run the complete repository checks with `npm run verify` in an environment where the project's dependencies are installed. Configure the GitHub App in staging and validate read access before approving any production write. The automated tests mock GitHub API requests and never modify a real repository.
