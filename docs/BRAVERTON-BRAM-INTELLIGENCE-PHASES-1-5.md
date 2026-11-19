# Braverton Bram Intelligence — phased implementation

This branch extends the existing Bram chat-workspace preview and integration systems. It does not replace the project builder, GitHub integration, MCP gateway, or Vercel deployment pipeline.

## Product contract
- Customer GitHub access uses the Braverton-owned GitHub App installation. No personal access token is requested.
- MCP identifies itself as Braverton and is aligned with the Braverton GitHub App identity.
- Preview creation and preview sharing never publish to production. Publishing remains a separate, explicit action.
- Preview feedback must be persisted as account-owned development instructions and attached to a Bram chat session.
- Execution activity must come from persisted backend events, not optimistic UI labels.

## Phase plan
1. GitHub App installation and contextual integration connection cards.
2. Durable execution lifecycle: accepted, working, tool started/completed, waiting for connection, completed, failed, cancelled.
3. Conversational project creation reuses existing projects/workspaces and build APIs; do not restore the removed Start Your Project screen.
4. Preview share links, review comments, and explicit publish action with verified deployment result.
5. Capability discovery and MCP tool routing through the Braverton platform identity and each user's verified installation.

## GitHub App configuration
Set server-side `GITHUB_APP_SLUG`, `GITHUB_APP_ID`, and `GITHUB_APP_PRIVATE_KEY`. Set GitHub App Setup URL to `https://<host>/api/integrations/github-app/callback`. The customer's installation ID remains encrypted in their `user_integrations` record. Keep the platform-owner installation ID separate for owner-only operations.

## Migration
Apply `supabase/migrations/20261119130000_bram_preview_collaboration_execution.sql` before enabling preview collaboration or execution event persistence.

## Verification
This branch has not been typechecked, linted, tested, or deployed. Verify App permissions and callback, apply the migration in staging, test account isolation, share-token expiry/revocation, comment-to-chat handoff, OAuth resume, and real customer GitHub/Vercel build and deployment. Do not merge or deploy until those checks pass.
