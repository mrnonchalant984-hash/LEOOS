# LeoX Store environment

The Store reuses existing server configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never prefix with `NEXT_PUBLIC_`)

Authenticated submissions also depend on the existing `user_rate_limits` table and `consume_user_rate_limit` RPC from migration `20261010120000_user_rate_limits.sql`. Configure values only in local ignored environment files or encrypted hosting settings. No credentials are required in source code, and no Store-specific environment variable was added.

The current deployment preflight requires additional LeonardX provider and worker settings. A passing static preflight would still not prove Store migration, provider, or production health.
