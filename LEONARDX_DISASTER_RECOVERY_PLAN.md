# LeonardX disaster recovery plan

Recovery readiness is NOT VERIFIED. The repository does not contain evidence of a completed restore drill.

## Required configuration to verify

- Supabase backup/PITR retention and restore permissions.
- Vercel deployment rollback and environment-variable recovery.
- Sentry/Speed Insights access recovery.
- Paystack webhook replay/reconciliation procedure.
- GitHub repository and migration history availability.

## Isolated restore drill

Restore a non-production Supabase target, apply migrations with `npx supabase db push --dry-run` followed by approved apply, validate RLS and counts on seeded data, then run `npm test`, `npm run typecheck`, and smoke checks. Record RTO/RPO from the actual drill; do not advertise targets as achieved beforehand.
