# LeonardX MCP Gateway Audit — Current State

Updated: 2026-10-29

The existing MCP route and server implementation are retained. MCP tools should use the central Gemini model registry for AI processing; external tool calls remain subject to the authenticated user's scope, explicit approvals, and per-account ownership checks.

Remote MCP connections now support Streamable HTTP with a legacy SSE fallback, remote tool rediscovery, schema-based argument validation, and revocation of approvals when a tool definition changes or disappears. New tools remain unapproved. The outbound host allowlist and public-DNS pinning remain enforced.

Static tests cover these controls, but authenticated end-to-end MCP initialization, external OAuth, external server discovery, real tool execution, persistence, and cross-account isolation have not been fully verified against staging. TinyFish is not preconfigured or allowlisted; do not claim it is connected until its exact provider endpoint, credentials, operator allowlist entry, and a safe live discovery test are available. No production writes, pushes, migrations, or deployment were performed during this repair.
