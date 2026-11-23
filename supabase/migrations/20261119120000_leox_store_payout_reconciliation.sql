-- Reconcile ambiguous Paystack seller transfers without issuing duplicate transfers.
-- This migration is additive and must be applied only after environment/backup review.

alter table public.marketplace_seller_payouts
  drop constraint if exists marketplace_seller_payouts_status_check;

alter table public.marketplace_seller_payouts
  add constraint marketplace_seller_payouts_status_check
  check (status in ('initiating','pending','unknown','paid','failed','reversed'));

alter table public.marketplace_seller_payouts
  add column if not exists provider_transfer_status text,
  add column if not exists last_provider_check_at timestamptz;

create index if not exists marketplace_seller_payouts_reconcile_idx
  on public.marketplace_seller_payouts(status, created_at)
  where status in ('initiating','unknown','pending');
