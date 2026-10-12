# LeonardX Supabase/Postgres guide

Migrations live in [`supabase/migrations/`](./supabase/migrations/). Use `npm run db:dry-run` to preview and `npm run db:push` only after explicit approval. RLS is the database boundary; service-role code is not automatically authorized. Test both allowed and denied rows. Credits and rate limits use database functions for atomic shared state. Query-plan evidence and restore drills are still required; see [`LEONARDX_DATABASE_AND_CACHING_REPORT.md`](./LEONARDX_DATABASE_AND_CACHING_REPORT.md).

Official references: [Supabase database overview](https://supabase.com/docs/guides/database/overview), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits), [PostgreSQL documentation](https://www.postgresql.org/docs/current/).
