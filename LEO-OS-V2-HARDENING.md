# LEO OS V2 — Production Hardening

This layer hardens the V2 API/control plane without replacing existing LEO OS functionality.

## Included
- Distributed Postgres-backed API-key rate limiting (120 requests/minute/key).
- Strict API-key format and scope validation.
- Request IDs and API request telemetry.
- API request log storage.
- AES-256-GCM encrypted webhook signing secrets.
- SHA-256 secret fingerprint retained for lookup/rotation checks.
- HTTPS-only webhook endpoints with common private/local address rejection.
- Real webhook test delivery with HMAC SHA-256 signatures.
- Queued webhook delivery worker with retries and exponential backoff.
- Vercel cron configuration for the delivery worker.
- Webhook delivery history and failure capture.
- Security event storage and RLS.
- Service-role-only access to sensitive API-key/rate-limit data.
- Idempotent additive Supabase migrations.

## Required provider configuration
Set `WEBHOOK_ENCRYPTION_KEY` to a 64-character hexadecimal AES-256 key.
Generate one with `openssl rand -hex 32`.

`CRON_SECRET` must already be configured for the Vercel cron worker.

## Supabase migration
Run `supabase/LEO-OS-V2-ONE-TIME-MIGRATION.sql` in the Supabase SQL Editor after the original `schema.sql`.

Do not manually create each table. The SQL creates/updates the required tables, indexes, RLS policies and database function.

If `leo-os-v2-platform.sql` has already been run, the combined migration remains safe because it uses `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` patterns. The hardening migration can also be run alone.

## Important
Existing webhook rows created before encrypted secret storage may have only `secret_hash`. Those webhooks must be rotated/recreated before live test delivery.
