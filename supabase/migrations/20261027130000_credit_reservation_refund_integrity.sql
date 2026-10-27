-- Forward-only hardening: tie refunds to the exact idempotent reservation.
-- This migration is additive and must be reviewed against the remote migration history before applying.
create or replace function public.reserve_platform_credits(p_user_id uuid, p_job_id uuid, p_cost integer)
returns integer language plpgsql security definer set search_path=public as $$
declare
  remaining integer;
  existing public.platform_credit_ledger%rowtype;
begin
  if p_cost is null or p_cost < 1 then raise exception 'Credit cost must be positive'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;

  select * into existing from public.platform_credit_ledger
    where user_id = p_user_id and idempotency_key = ('reserve:' || p_job_id::text);
  if found then
    if existing.job_id is distinct from p_job_id or existing.amount <> -p_cost or existing.event_type <> 'reserve' then
      raise exception 'Credit reservation idempotency conflict';
    end if;
    return existing.balance_after;
  end if;

  update public.platform_credit_accounts
    set balance = balance - p_cost,
        total_spent = total_spent + p_cost,
        updated_at = now()
    where user_id = p_user_id and balance >= p_cost
    returning balance into remaining;
  if not found then
    if not exists (select 1 from public.platform_credit_accounts where user_id = p_user_id) then
      raise exception 'Platform credit account not found';
    end if;
    raise exception 'Insufficient platform credits';
  end if;

  insert into public.platform_credit_ledger(user_id, job_id, amount, event_type, source, idempotency_key, balance_after)
    values (p_user_id, p_job_id, -p_cost, 'reserve', 'generation', 'reserve:' || p_job_id::text, remaining);
  return remaining;
end; $$;

create or replace function public.refund_platform_credits(p_user_id uuid, p_job_id uuid, p_cost integer)
returns integer language plpgsql security definer set search_path=public as $$
declare
  remaining integer;
  reservation public.platform_credit_ledger%rowtype;
  prior_refund public.platform_credit_ledger%rowtype;
begin
  if p_cost is null or p_cost < 1 then raise exception 'Refund cost must be positive'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;

  select * into reservation from public.platform_credit_ledger
    where user_id = p_user_id and idempotency_key = ('reserve:' || p_job_id::text)
    for update;
  if not found or reservation.event_type <> 'reserve' or reservation.job_id is distinct from p_job_id then
    raise exception 'Matching credit reservation not found';
  end if;
  if reservation.amount <> -p_cost then raise exception 'Refund amount does not match reserved credits'; end if;

  select * into prior_refund from public.platform_credit_ledger
    where user_id = p_user_id and idempotency_key = ('refund:' || p_job_id::text);
  if found then
    if prior_refund.event_type <> 'refund' or prior_refund.job_id is distinct from p_job_id or prior_refund.amount <> p_cost then
      raise exception 'Credit refund idempotency conflict';
    end if;
    select balance into remaining from public.platform_credit_accounts where user_id = p_user_id;
    if not found then raise exception 'Platform credit account not found'; end if;
    return remaining;
  end if;

  update public.platform_credit_accounts
    set balance = balance + p_cost,
        total_spent = greatest(0, total_spent - p_cost),
        updated_at = now()
    where user_id = p_user_id
    returning balance into remaining;
  if not found then raise exception 'Platform credit account not found'; end if;

  insert into public.platform_credit_ledger(user_id, job_id, amount, event_type, source, idempotency_key, balance_after)
    values (p_user_id, p_job_id, p_cost, 'refund', 'generation_failure', 'refund:' || p_job_id::text, remaining);
  return remaining;
end; $$;

revoke all on function public.reserve_platform_credits(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_platform_credits(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_platform_credits(uuid, uuid, integer) to service_role;
grant execute on function public.refund_platform_credits(uuid, uuid, integer) to service_role;
