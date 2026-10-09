-- Add the atomic delivery claim marker to databases where the original
-- webhook migration has already been applied.
alter table public.webhook_deliveries
  add column if not exists claimed_at timestamptz;
