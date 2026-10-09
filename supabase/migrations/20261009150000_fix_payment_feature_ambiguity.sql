-- Fix Paystack subscription application when a PL/pgSQL variable collides with
-- the credits.feature / feature_access.feature_name column names.
create or replace function public.apply_verified_subscription_payment(p_reference text, p_paid_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row payments%rowtype;
  period_months integer;
  plan_credits integer;
  period_start timestamptz;
  period_end timestamptz;
  feature_key text;
begin
  select p.* into payment_row
  from payments as p
  where p.reference = p_reference
  for update;

  if not found then raise exception 'Payment reference is not registered'; end if;
  if payment_row.status = 'success' then return false; end if;
  if payment_row.status <> 'pending' then raise exception 'Payment is not pending'; end if;
  if payment_row.amount_kobo is null or payment_row.amount_kobo <= 0 then
    raise exception 'Registered payment amount is invalid';
  end if;

  period_months := case payment_row.billing_period
    when 'monthly' then 1
    when 'quarterly' then 3
    when 'yearly' then 12
    else null
  end;
  if period_months is null then raise exception 'Invalid billing period'; end if;

  plan_credits := case payment_row.plan
    when 'standard' then 30
    when 'pro' then 100
    when 'unlimited' then 500
    else null
  end;
  if plan_credits is null then raise exception 'Invalid subscription plan'; end if;

  perform 1 from profiles where id = payment_row.user_id for update;
  select coalesce(
    max(case
      when coalesce(s.ends_at, s.current_period_end) > p_paid_at
        then coalesce(s.ends_at, s.current_period_end)
      else p_paid_at
    end),
    p_paid_at
  ) into period_start
  from subscriptions as s
  where s.user_id = payment_row.user_id and s.status = 'active';
  period_end := period_start + make_interval(months => period_months);

  update payments as p set status = 'success', paid_at = p_paid_at,
    verified_at = now(), paystack_reference = p_reference
    where p.id = payment_row.id;
  update subscriptions as s set status = 'expired'
    where s.user_id = payment_row.user_id and s.status = 'active';
  insert into subscriptions (user_id, plan, billing_period, status,
    current_period_start, current_period_end, starts_at, ends_at, payment_reference)
    values (payment_row.user_id, payment_row.plan, payment_row.billing_period,
      'active', period_start, period_end, period_start, period_end, p_reference);

  foreach feature_key in array array['image_generation', 'code_generation', 'background_removal', 'website_deployment'] loop
    insert into credits (user_id, feature, credits_remaining, credits_used, last_reset)
      values (payment_row.user_id, feature_key, plan_credits, 0, p_paid_at)
      on conflict (user_id, feature) do update set
        credits_remaining = excluded.credits_remaining,
        credits_used = 0,
        last_reset = excluded.last_reset;
    insert into feature_access (user_id, feature_name, has_access, granted_by, expires_at)
      values (payment_row.user_id, feature_key, true, 'subscription', period_end)
      on conflict (user_id, feature_name) do update set
        has_access = true,
        granted_by = 'subscription',
        expires_at = excluded.expires_at;
  end loop;
  return true;
end;
$$;

revoke all on function public.apply_verified_subscription_payment(text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_subscription_payment(text, timestamptz) to service_role;
