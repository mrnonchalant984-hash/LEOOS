# LeoX Store deployment

No deployment or production migration was performed or authorized. No production URL was tested.

Before release, apply the migration to staging, verify database constraints and RLS, configure Supabase URL/anon/service-role settings in the hosting provider, run `npm run verify`, exercise signed-in submission and cross-user/RLS scenarios, and verify public pages plus `/api/health/ready` in staging. Review backups, rollback, and current release gates in `PRODUCTION-READINESS.md`. Do not run the production push until the migration dry-run is reviewed and deployment has explicit authorization.
