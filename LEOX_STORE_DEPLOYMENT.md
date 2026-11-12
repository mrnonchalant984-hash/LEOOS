# LeoX Store deployment

No deployment or production migration was performed for this reconciliation. No production URL, Paystack account, or live checkout was tested. Read-only Supabase migration-history output showed remote migration versions matching local through `20261111160000`; this does not establish environment identity, actual RLS behavior, or live readiness.

Before any release, identify and record the target environment, backup/recovery owner, schema diff, provider configuration, checkout gate, monitoring, and rollback plan. Run authenticated cross-account RLS tests and Store end-to-end checks in a confirmed non-production environment. Do not apply a migration or deploy to production without separate explicit authorization.

Use [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md) as the current production gate and [docs/LEOX_STORE_LAUNCH_CHECKLIST.md](./docs/LEOX_STORE_LAUNCH_CHECKLIST.md) as the operator checklist. Do not rely on stale instructions to run an unverified generic `npm run verify` command.
