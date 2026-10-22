# LeonardX customer-owned connections and domain management

## Included in this release

- `user_integrations` stores customer-owned provider connections, with encrypted credentials and per-user row scoping.
- `GET/POST /api/integrations/connections` lists and saves supported connections without returning secret material.
- `DELETE /api/integrations/connections/:id` disconnects a credential from LeonardX.
- GitHub, Vercel, Supabase Management API, OpenAI, Anthropic and Gemini credentials can be checked against provider endpoints.
- Build/deploy prefers the current user's verified GitHub and Vercel connection; legacy platform environment credentials remain a compatibility fallback when the user has not connected personal credentials.
- `GET/POST/DELETE /api/integrations/vercel/domains` manages domains through the current user's verified Vercel token and checks that the project is accessible to that token.
- Website project screens expose domain management after a Vercel project ID has been saved.
- Build approval UI supports `Allow once`, `Allow always`, and `Ask every time`. The preference is browser-local UX convenience; the API still authenticates the user, enforces plan/build limits, and checks ownership. This is not an authorization grant for destructive database operations.
- Custom MCP servers remain on the dedicated MCP connection manager with endpoint validation, encrypted bearer credentials, discovery, and per-tool approval.

## Required rollout steps

1. Back up the database and apply `supabase/migrations/20261021210000_user_owned_integrations.sql` to staging first.
2. Configure `MCP_CREDENTIAL_ENCRYPTION_KEY` as a unique random 32-byte key (64 hex characters or base64). Keep it stable across deploys and never expose it to client-side variables. Losing it makes saved connection credentials unreadable; rotating it requires a credential re-encryption migration.
3. Deploy the application with the migration applied.
4. Connect a test user's own GitHub and Vercel tokens in Integrations. Use least-privilege tokens and verify the UI reports `Verified`.
5. Test repository creation, Vercel project creation, deployment readiness, and custom-domain add/list/remove against non-production accounts before using production projects.
6. Verify DNS instructions with the registrar and wait for provider verification/TLS before advertising a custom domain as live.
7. Verify tenant isolation with two test accounts. A connection query must always filter by the authenticated user ID.

## Provider and feature boundaries

A `Configured` state means the secret was saved encrypted, not that provider API operations were tested. Providers without a provider-specific OAuth/API adapter (currently Firebase, Meta, WhatsApp Business, YouTube, and custom MCP in this general connection registry) are saved as `Configured` only. Use the dedicated MCP manager for real custom-MCP discovery and per-tool approvals. Do not treat a generic saved access token as a complete integration.

GitHub/Vercel connections currently use user-provided access tokens; provider-hosted OAuth flows and refresh-token rotation are not included in this change. User tokens should be narrowly scoped and revoked at the provider when no longer needed. Removing a connection from LeonardX does not revoke the token at its provider.

Supabase Management API connection is verified at the project-list endpoint; this change does not automatically execute migrations against live databases. A separate migration workflow must preview SQL, preserve a migration file in the project repository, require explicit approval for production execution, and record its result. Do not run unreviewed SQL or destructive changes automatically.

Build approval `Allow always` is saved in the current browser's local storage, not as an organization-wide/server-side policy. It is a convenience setting, not a security boundary. Sensitive external actions must continue to use server-side authorization, ownership checks, and separate approval.

## Operational constraints

- A custom domain registration is not proof that DNS or TLS is ready. Read the provider's returned verification information and check live resolution before marking the site live.
- If a domain's DNS is managed by another registrar, the user may still need to publish the requested DNS records there.
- Platform-managed `GITHUB_TOKEN` / `VERCEL_TOKEN` remains a compatibility fallback. To guarantee the repository and hosting account belong to a customer, ensure the user has connected verified personal credentials and that the integration table migration is applied.
- Provider APIs, external account quotas, plan allowances, build workers, and deployment readiness still need live staging tests before production release.
