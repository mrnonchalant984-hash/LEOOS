# LeonardX disaster recovery runbook

First establish incident scope and stop unsafe retries. Preserve correlation IDs. Verify Vercel rollback and Supabase backup/PITR availability, then restore only into an isolated target. Apply migrations forward, validate RLS and payment/webhook tables, run the release checks, and reconcile Paystack events before reopening payment flows. RTO/RPO are not measured; see [`LEONARDX_DISASTER_RECOVERY_PLAN.md`](./LEONARDX_DISASTER_RECOVERY_PLAN.md).
