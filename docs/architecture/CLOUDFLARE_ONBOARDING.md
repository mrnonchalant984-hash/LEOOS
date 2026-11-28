# Cloudflare Workspace Onboarding

This guide covers the optional developer tooling and the gated static and
full-stack Next.js preview paths. It does not provision Cloudflare resources or authorize an account.

## MCP server

The workspace endpoint is declared in [.vscode/mcp.json](../../.vscode/mcp.json):

```json
{
  "servers": {
    "cloudflare": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/mcp"
    }
  }
}
```

In VS Code, enable the server from the MCP servers UI and complete Cloudflare's
OAuth flow yourself. Begin with the narrowest read-only permissions needed for
documentation and account inspection. Do not grant production write access or
approve destructive actions as part of onboarding. No credentials are stored
in this repository.

Cloudflare documents this endpoint as a broad API and documentation MCP
server. Adding the URL does not prove that OAuth, tools, or an account
connection work.

## Cloudflare Skills plugin

Cloudflare's official [Skills repository](https://github.com/cloudflare/skills)
provides contextual guidance and includes the Cloudflare MCP server. To
install its VS Code plugin:

1. Enable `chat.plugins.enabled` in VS Code settings.
2. Run **Chat: Install Plugin From Source** from the Command Palette.
3. Enter `https://github.com/cloudflare/skills` and follow VS Code's prompts.

The plugin bundles the same Cloudflare MCP server configured above. If you
install the plugin, remove or disable the standalone entry in
[.vscode/mcp.json](../../.vscode/mcp.json) if VS Code exposes duplicate
Cloudflare servers. Plugin installation is a user action and has not been
performed by this repository change.

## CLI and runtime

The preview provider deploys a separate Cloudflare Worker for each Braverton
project. Static sites use a lightweight asset Worker. Next.js projects are
built on a fresh GitHub-hosted runner with the pinned OpenNext Cloudflare
adapter and run as an isolated Worker on a `workers.dev` preview hostname.
This path supports Next.js App Router and Pages Router, SSR, React Server
Components, route handlers, streaming, and Server Actions. It is not a Vercel
production deployment and does not change the production branch or domain.

The build runner receives only a minimal allowlisted process environment.
Project dependencies and build scripts run without the Cloudflare deployment
token, Braverton callback secret, GitHub credentials, or production API keys.
The Cloudflare token is introduced only for the final Wrangler deployment
step. Preview Workers do not receive Braverton production secrets or database
credentials. Do not copy production environment variables
into a preview Worker or expose service-role keys, Gemini keys, payment keys,
or private integration credentials to generated project code.

Production data access must go through a Braverton-owned backend endpoint, not
a direct Supabase connection from the preview. Such endpoints must authenticate
the Braverton user, bind access to the owning project, expose fixed allowlisted
read operations only, enforce row-level ownership, rate limits and audit
logging, and reject writes, deletes, payments, account changes, publishing,
arbitrary SQL, and caller-selected table/column names. Gemini and private
integrations remain behind authenticated Braverton server endpoints. The implemented bridge issues a five-minute HMAC capability only after the
Braverton user is authenticated in the parent app. The iframe receives it via
an origin-targeted `postMessage`; the capability is bound to one project and
one `project_summary:read` scope. The backend accepts requests only from that
project's exact assigned `workers.dev` origin, rate-limits by IP and user, and
returns only the owner's project ID, name, and type. It does not expose a
generic database proxy or arbitrary table/query interface. All other data
resources and private integrations remain unavailable until separately
allowlisted and tested. No staging database is required for this security
boundary.

To enable the preview path after account setup:

1. Confirm that the Cloudflare Worker account and `workers.dev` subdomain are
   active. The preview worker creates uniquely named Workers under the
   configured account; it does not create a production Worker or custom domain.
2. Confirm the preview queue and retry migrations are applied:
   `20261105120000_cloudflare_static_previews.sql` and
   `20261123124237_cloudflare_preview_retries_and_heartbeats.sql`.
3. Set `LEONARDX_CLOUDFLARE_PREVIEWS_ENABLED=true`,
   `CLOUDFLARE_WORKER_PREFIX`, and the existing high-entropy
   `CRON_SECRET` in the Braverton server environment. The former
   `CLOUDFLARE_PAGES_PROJECT` name remains accepted as a compatibility alias.
4. Configure GitHub Actions secrets: `LEONARDX_BASE_URL`, `CRON_SECRET`,
   `CLOUDFLARE_API_TOKEN` (scoped to Worker deployment on the intended
   account), `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_WORKER_PREFIX`.
   The former `CLOUDFLARE_PAGES_PROJECT` secret is temporarily accepted as a
   fallback. The API token belongs only in GitHub Actions, never in the app
   environment or browser.
5. The action checks for a queued preview every five minutes. It transfers a
   bounded source snapshot to a fresh runner, auto-detects static or supported
   Next.js source, builds Next.js through OpenNext, deploys the project-scoped
   Worker, health-checks the resulting HTTPS URL, and records only a verified
   preview result. It does not clone or update the user's project repository.

Each user is limited to 3 preview jobs per 24 hours and the plan's existing
monthly build allowance; the account also has a rolling 30-day preview cap of
400 jobs. A project can have only one queued/running job at a time. The current
source snapshot is limited to 250 text files, 256 KB per file, and 2 MB total.
Supported Next.js projects must include a valid `package.json` and a supported
App Router or Pages Router entry. Static sites require a root `index.html`.
PDF, video, audio, archives, executable files, and other unlisted binary types are not transferred. Common credential patterns are blocked in text source, but that scan is not exhaustive. Preview
URLs are public to anyone who has the URL; do not include confidential data.
Historical Worker TTL/deletion is not yet automated, so account retention and
usage should be monitored.

## References

- [Cloudflare MCP server documentation](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
- [Cloudflare Skills README](https://github.com/cloudflare/skills)
- [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
