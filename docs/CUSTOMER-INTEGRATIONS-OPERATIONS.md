# Customer-owned integrations: operations and rollout

## OAuth providers

The OAuth callback URL must be registered exactly with each provider and set in `INTEGRATION_OAUTH_CALLBACK_URL`. Configure the relevant client ID/secret pairs in the server environment only. Never expose provider client secrets as `NEXT_PUBLIC_*` variables. Apply both migrations:

- `20261021210000_user_owned_integrations.sql`
- `20261021220000_integration_oauth_states.sql`

OAuth state values are random, hashed at rest, expire after ten minutes, and are consumed before code exchange. Integration tokens are encrypted with `MCP_CREDENTIAL_ENCRYPTION_KEY`. Access is always scoped by authenticated user ID. Users can disconnect the connection from Integrations; they should also revoke provider grants at the provider when they want immediate revocation.

## Implemented operations

Authenticated POST requests to `/api/integrations/{provider}/{action}` use the user's own stored connection. The supported actions are:

- GitHub: `create-repo`, `commit-file` (writes require `confirm: true`).
- Vercel: `create-project`, `deploy-git-repo`; custom domain add/list/remove is in `/api/integrations/vercel/domains`.
- Supabase: `apply-migration` using the user's Supabase Management API token (requires `migrationName`, `sql`, and `confirm: true`).
- Firebase: `project`, `firestore-document` (writes require `confirm: true`).
- YouTube: `channel`, `analytics` (requires valid date range and a supported metric).
- Meta: `pages`, `page-insights`, `send-message` (message sends require `confirm: true`).
- WhatsApp Business: `send` (message sends require `confirm: true`).

For a provider call, send JSON in the request body. Use `connectionId` to select a specific saved connection. Without it, the most recently created configured/verified connection for that provider is selected.

## Provider-side requirements

OAuth implementation does not bypass provider approval, app review, business verification, scopes, quotas, or account eligibility. Register production redirect URLs and request only scopes your app has been approved to use. WhatsApp Cloud API requires a configured Meta app, business/phone-number onboarding, and a valid phone number ID; pass `phoneNumberId` if it was not stored with the credential. Firebase operations require Google OAuth consent and Cloud IAM/API access for the selected project. YouTube analytics only returns data available to the authorized channel. Messenger sends require an eligible Page, correct Page permissions, and an eligible recipient/window. Supabase SQL is powerful and can destroy data; only submit reviewed migrations to the user's explicitly connected project.

## Production rollout checklist

1. Configure stable `MCP_CREDENTIAL_ENCRYPTION_KEY` and OAuth secrets in the hosting environment.
2. Apply migrations to staging, then production using the project's normal migration process.
3. Configure OAuth applications and exact redirect URIs, scopes, privacy policy, terms, and provider review requirements.
4. Verify each provider with a dedicated test account and a non-production project.
5. Test revoked grants, expired tokens, provider rate limits, account isolation, callback replay, and failed audit writes.
6. Test the production build and run smoke tests against live provider APIs before declaring a provider enabled.

This code provides provider adapters and authenticated workflows, but cannot assert live production readiness until the real provider app credentials, approvals, database migration, and end-to-end tests are supplied and verified.
