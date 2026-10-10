-- Records the verified Paystack hosting-renewal reference separately from the
-- subscription's current reference, so duplicate provider events cannot extend
-- the same hosting period twice. Existing subscriptions and payment history are
-- left untouched.
create table if not exists public.hosting_renewal_payments (
  reference text primary key,
  hosting_subscription_id uuid references public.hosting_subscriptions(id) on delete set null,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_hosting_renewal_payments_subscription
  on public.hosting_renewal_payments(hosting_subscription_id, created_at desc);

alter table public.hosting_renewal_payments enable row level security;
revoke all on table public.hosting_renewal_payments from public, anon, authenticated;
grant all on table public.hosting_renewal_payments to service_role;

create or replace function public.apply_verified_hosting_renewal_payment(
  p_reference text,
  p_paid_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  renewal public.hosting_renewal_payments%rowtype;
  hosting public.hosting_subscriptions%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_reference is null or length(p_reference) not between 1 and 200 or p_paid_at is null then
    raise exception 'Invalid verified renewal details';
  end if;

  select * into renewal
  from public.hosting_renewal_payments as payment
  where payment.reference = p_reference
  for update;

  if not found then raise exception 'Hosting renewal reference is not registered'; end if;
  if renewal.status = 'succeeded' then return false; end if;
  if renewal.status <> 'pending' then raise exception 'Hosting renewal is not pending'; end if;
  if renewal.hosting_subscription_id is null then raise exception 'Hosting subscription is unavailable'; end if;

  select * into hosting
  from public.hosting_subscriptions as subscription
  where subscription.id = renewal.hosting_subscription_id
  for update;

  if not found then raise exception 'Hosting subscription is unavailable'; end if;

  period_start := greatest(hosting.ends_at, p_paid_at);
  period_end := period_start + interval '3 months';

  update public.hosting_subscriptions
  set status = 'active',
      ends_at = period_end,
      next_renewal_at = period_end,
      paystack_reference = p_reference,
      updated_at = now()
  where id = hosting.id;

  update public.hosting_renewal_payments
  set status = 'succeeded', paid_at = p_paid_at, updated_at = now()
  where reference = p_reference;

  return true;
end;
$$;

revoke all on function public.apply_verified_hosting_renewal_payment(text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_hosting_renewal_payment(text, timestamptz) to service_role;
