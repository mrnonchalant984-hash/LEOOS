# Braverton GitHub App authentication

The GitHub App supports two separate installation contexts:

- The platform-owned installation used by owner-only main-website MCP operations.
- Customer-owned installations used by Bram's website builder. Each customer's installation ID and GitHub account identity are stored inside that customer's encrypted `user_integrations` record. Bram mints a short-lived installation token at build time; it does not use a shared platform GitHub token for customer repository creation.

The customer installation callback is `/api/integrations/github-app/callback`. Configure this exact route as the GitHub App's **Setup URL**. The app slug is configured as `GITHUB_APP_SLUG`.

## GitHub App setup

1. Open GitHub Developer Settings and select the GitHub App used by LeonardX (or create one if none exists).
2. Set **Repository permissions** to:
   - **Contents: Read and write**
   - **Repository creation: Read and write** (the narrow permission for creating repositories; do not request broad Administration write solely for repository creation)
   - **Metadata: Read-only** (required by GitHub)
3. Save the permission changes. If GitHub prompts for installation permission approval, approve them.
4. Configure the App's **Setup URL** as `https://YOUR-BRAVERTON-HOST/api/integrations/github-app/callback`. This is where GitHub returns the installation ID and one-time state after installation.
5. Install the App on the account that owns the configured main website repository. Select **Only select repositories** and select `LEOOS` in `mrnonchalant984-hash` (or the exact repository configured in `LEO_MAIN_WEBSITE_REPOSITORY`). Customers will separately install the same App from Braverton Integrations on their own GitHub account.
6. Copy the numeric **App ID** from the App's General settings. Do not use the OAuth Client ID.
7. Copy the App **slug** from its GitHub URL.
8. Generate/download a private key for that App. Store it only as a server-side secret.
9. Find the numeric **installation ID** for the platform-owned installation that includes the target repository. Do not use the App ID or OAuth Client ID in this field.

The application requests an installation token scoped to the configured repository name, uses a short-lived App JWT to obtain it, and caches the installation token only until five minutes before its expiration. No credential or token is logged. App authentication failures are sanitized and do not fall back to a user token.

## Environment variables

Set these in local `.env.local` or the Vercel project's **Settings → Environment Variables**. Do not prefix them with `NEXT_PUBLIC_` and do not commit them.

```dotenv
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=braverton
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GITHUB_APP_INSTALLATION_ID=12345678
```

The app accepts escaped `\n` sequences or real newlines in the private key. Set all three variables together. If none are set, owner main-website MCP operations retain the existing verified GitHub integration fallback. If only some are set, operations fail closed rather than silently falling back.

Keep the existing variables configured:

```dotenv
LEO_MAIN_WEBSITE_REPOSITORY=mrnonchalant984-hash/LEOOS
LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID=leoos
```

The platform installation continues to serve owner-only main-website MCP operations. Customer installations are independent: Bram reads the installation ID from the authenticated customer's encrypted integration record and obtains a short-lived token for that installation. Customer website builds require a verified customer GitHub App installation and a verified customer Vercel integration. Legacy GitHub OAuth remains available temporarily for existing customers, but it is not the recommended connection method.

## Safety guarantees retained

- Platform-owner authorization and owner/token identity check.
- MCP `mcp:write` scope and `confirm: true` for write tool invocation.
- Fresh expected main-branch commit SHA check.
- Existing write rate limit, file/path validation, secret scanning, workflow-file restrictions, Vercel repository-link verification, and non-force branch update.
- No production write is performed by automated tests.

## Files changed by this upgrade

- `lib/mcp/github-app-auth.ts` — App JWT, platform and customer installation-token exchange, safe cache, and configuration validation.
- `app/api/integrations/github-app/start/route.ts` and `callback/route.ts` — authenticated, expiring, single-use customer installation flow and verified account/permission persistence.
- `app/api/build-deploy/route.ts` — customer-specific installation tokens, no platform GitHub-token fallback for customer builds, and stale-authorization diagnostics.
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
