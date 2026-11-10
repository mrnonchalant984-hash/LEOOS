# Cloudflare Workspace Onboarding

This guide covers the optional developer tooling and the gated static preview
path. It does not provision Cloudflare resources or authorize an account.

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

Wrangler 4.159.0 is installed as a repository-local dev dependency and was
verified with `npx wrangler --version`. The preview worker requires a
pre-created Cloudflare Pages Direct Upload project. It checks that project
exists before deploying and uses a unique preview branch per LeonardX project;
it never creates a Pages project or targets the production branch. A preview
is public to anyone who has its URL. Only saved static text assets are
accepted; do not include credentials, private data, or confidential material.

To enable the preview path after account setup:

1. Apply `supabase/migrations/20261105120000_cloudflare_static_previews.sql`.
2. Set `LEONARDX_CLOUDFLARE_PREVIEWS_ENABLED=true` and the matching
   `CLOUDFLARE_PAGES_PROJECT` in the LeonardX server environment. Keep the
   existing high-entropy `CRON_SECRET`.
3. Configure GitHub Actions secrets: `LEONARDX_BASE_URL`, `CRON_SECRET`,
   `CLOUDFLARE_API_TOKEN` (scoped to Pages read/edit on the intended account),
   `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PAGES_PROJECT`. The project name
   must match the server setting. The API token belongs only in GitHub
   Actions, never the app environment or browser.
4. The action checks for a queued preview every five minutes. It transfers a
   bounded static snapshot to the runner, uploads it with Wrangler to the
   pre-created Pages project, verifies the branch URL responds, and records
   only the verified preview result. It does not clone or update the user's
   project repository.

Each user is limited to 3 preview jobs per 24 hours and the plan's existing
monthly build allowance (counting current-month website builds and previews);
the application also stops queueing at 400 preview jobs per rolling 30 days,
below the documented Pages Free build allowance. A project can have only one
queued/running job at a time. Each snapshot is limited to 250 text assets,
256 KB per file, and 2 MB total; only HTML, CSS, JS, JSON, SVG, text, XML, and
web manifests are accepted. Framework builds, server-side code, and binary
assets are not executed or transformed. Re-creating a preview updates that
project's stable branch alias. Automatic deletion of historical Cloudflare
deployment records is not implemented; review Cloudflare retention before
enabling the feature. Common credential patterns are blocked, but that scan is
not exhaustive and does not replace checking the files yourself.

Cloudflare's official Skills repository also documents the beta `cf` CLI; it
was not installed. Do not run deploy, publish, or resource-creation commands
until the target account, permissions, preview scope, and spending limits are
explicitly confirmed.

## References

- [Cloudflare MCP server documentation](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
- [Cloudflare Skills README](https://github.com/cloudflare/skills)
- [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
