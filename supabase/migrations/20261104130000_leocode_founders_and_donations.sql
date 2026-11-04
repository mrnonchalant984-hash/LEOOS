create table if not exists public.leocode_invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  max_redemptions integer not null check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (redemption_count <= max_redemptions)
);

create table if not exists public.leocode_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  email text not null,
  status text not null default 'approved' check (status in ('approved', 'expired', 'revoked')),
  invitation_code_id uuid not null references public.leocode_invitation_codes(id),
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leocode_redemptions (
  id uuid primary key default gen_random_uuid(),
  invitation_code_id uuid not null references public.leocode_invitation_codes(id),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invitation_code_id, user_id)
);

create table if not exists public.leocode_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_type text not null default 'founders_early_access'
    check (entitlement_type = 'founders_early_access'),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at = started_at + interval '60 days')
);

create index if not exists leocode_entitlements_user_expiry_idx
  on public.leocode_entitlements(user_id, expires_at desc);
create index if not exists leocode_invitation_codes_expiry_idx
  on public.leocode_invitation_codes(status, expires_at);
create index if not exists leocode_waitlist_created_idx
  on public.leocode_waitlist(created_at desc);
create index if not exists leocode_redemptions_code_idx
  on public.leocode_redemptions(invitation_code_id, redeemed_at desc);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  supporter_name text,
  email text not null,
  amount numeric(12, 2) not null check (amount > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_provider text not null default 'paystack' check (payment_provider = 'paystack'),
  transaction_reference text not null unique,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'success', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists donations_created_idx on public.donations(created_at desc);
create index if not exists donations_status_created_idx on public.donations(payment_status, created_at desc);

alter table public.leocode_invitation_codes enable row level security;
alter table public.leocode_waitlist enable row level security;
alter table public.leocode_redemptions enable row level security;
alter table public.leocode_entitlements enable row level security;
alter table public.donations enable row level security;

revoke all on public.leocode_invitation_codes, public.leocode_waitlist,
  public.leocode_redemptions, public.leocode_entitlements, public.donations
  from public, anon, authenticated;

grant select on public.leocode_waitlist, public.leocode_redemptions,
  public.leocode_entitlements to authenticated;
grant all on public.leocode_invitation_codes, public.leocode_waitlist,
  public.leocode_redemptions, public.leocode_entitlements, public.donations
  to service_role;

drop policy if exists leocode_waitlist_read_self on public.leocode_waitlist;
create policy leocode_waitlist_read_self on public.leocode_waitlist
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists leocode_redemptions_read_self on public.leocode_redemptions;
create policy leocode_redemptions_read_self on public.leocode_redemptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists leocode_entitlements_read_self on public.leocode_entitlements;
create policy leocode_entitlements_read_self on public.leocode_entitlements
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.redeem_leocode_invitation(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_code_hash text,
  p_terms_accepted_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.leocode_invitation_codes%rowtype;
  verified_email text;
  email_verified_at timestamptz;
  entitlement_id uuid;
  now_at timestamptz := clock_timestamp();
begin
  if p_user_id is null or length(trim(coalesce(p_full_name, ''))) not between 2 and 120
    or p_code_hash !~ '^[a-f0-9]{64}$' or p_terms_accepted_at is null then
    raise exception 'invalid_registration';
  end if;

  select lower(email), email_confirmed_at into verified_email, email_verified_at
    from auth.users where id = p_user_id;
  if verified_email is null or email_verified_at is null
    or verified_email <> lower(trim(coalesce(p_email, ''))) then
    raise exception 'verified_account_required';
  end if;

  select * into invitation from public.leocode_invitation_codes
    where code_hash = p_code_hash for update;
  if not found or invitation.status <> 'active'
    or invitation.expires_at <= now_at
    or invitation.redemption_count >= invitation.max_redemptions then
    raise exception 'invitation_unavailable';
  end if;

  if exists (select 1 from public.leocode_redemptions where user_id = p_user_id) then
    raise exception 'already_redeemed';
  end if;

  insert into public.leocode_waitlist
    (user_id, full_name, email, status, invitation_code_id, terms_accepted_at)
  values
    (p_user_id, trim(p_full_name), verified_email, 'approved', invitation.id, p_terms_accepted_at);

  insert into public.leocode_redemptions (invitation_code_id, user_id, redeemed_at)
    values (invitation.id, p_user_id, now_at);

  update public.leocode_invitation_codes
    set redemption_count = redemption_count + 1,
        status = case when redemption_count + 1 >= max_redemptions then 'inactive' else status end
    where id = invitation.id;

  insert into public.leocode_entitlements
    (user_id, entitlement_type, status, started_at, expires_at)
  values
    (p_user_id, 'founders_early_access', 'active', now_at, now_at + interval '60 days')
  returning id into entitlement_id;

  return entitlement_id;
end;
$$;

revoke all on function public.redeem_leocode_invitation(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.redeem_leocode_invitation(uuid, text, text, text, timestamptz)
  to service_role;

create or replace function public.expire_leocode_entitlements()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer;
  expired_entitlement record;
begin
  expired_count := 0;
  for expired_entitlement in
    update public.leocode_entitlements
      set status = 'expired'
      where status = 'active' and expires_at <= now()
      returning user_id, expires_at
  loop
    insert into public.notifications (user_id, title, body, read, created_at)
      values (
        expired_entitlement.user_id,
        'LeoCode Founders access ended',
        'Your 60-day Founders Early Access period has ended. Your account is back on its normal LeonardX plan. Your projects, files, and conversations are unchanged.',
        false,
        now()
      );
    expired_count := expired_count + 1;
  end loop;

  update public.leocode_waitlist w
    set status = 'expired'
    where w.status = 'approved'
      and exists (
        select 1 from public.leocode_entitlements e
        where e.user_id = w.user_id and e.entitlement_type = 'founders_early_access'
          and e.status = 'expired' and e.expires_at <= now()
      );
  return expired_count;
end;
$$;

revoke all on function public.expire_leocode_entitlements() from public, anon, authenticated;
grant execute on function public.expire_leocode_entitlements() to service_role;

create or replace function public.confirm_donation_payment(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text,
  p_paid_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  donation_row public.donations%rowtype;
begin
  select * into donation_row from public.donations
    where transaction_reference = p_reference for update;
  if not found then raise exception 'donation_not_registered'; end if;
  if donation_row.payment_status = 'success' then return false; end if;
  if donation_row.payment_status <> 'pending'
    or donation_row.amount_kobo <> p_amount_kobo
    or donation_row.currency <> upper(coalesce(p_currency, '')) then
    raise exception 'donation_payment_mismatch';
  end if;

  update public.donations
    set payment_status = 'success', paid_at = coalesce(p_paid_at, now())
    where id = donation_row.id;
  return true;
end;
$$;

revoke all on function public.confirm_donation_payment(text, bigint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_donation_payment(text, bigint, text, timestamptz)
  to service_role;

create or replace function public.get_donation_admin_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table(total_verified numeric, verified_supporters bigint, verified_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(amount), 0)::numeric,
    count(distinct lower(email)),
    count(*)
  from public.donations
  where payment_status = 'success'
    and (p_from is null or created_at >= p_from)
    and (p_to is null or created_at <= p_to);
$$;

revoke all on function public.get_donation_admin_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_donation_admin_summary(timestamptz, timestamptz)
  to service_role;
