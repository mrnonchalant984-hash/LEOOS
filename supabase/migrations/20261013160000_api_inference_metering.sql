-- Inference-only billing: metadata endpoints authenticate without spending credits.
-- Model calls reserve credits, then reconcile against measured provider token usage.
create or replace function public.consume_api_request_credit(p_user_id uuid, p_usage_id uuid, p_credits integer default 1)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.api_plan_subscriptions%rowtype;
begin
  if p_credits < 1 or p_credits > 100 then raise exception 'Invalid credit amount'; end if;
  select * into s from public.api_plan_subscriptions
    where user_id=p_user_id and status='active' and current_period_end > now() and credits_remaining >= p_credits
    order by current_period_end desc, created_at desc limit 1 for update;
  if not found then return false; end if;
  update public.api_plan_subscriptions set credits_remaining=credits_remaining-p_credits, updated_at=now() where id=s.id;
  insert into public.api_credit_events(user_id,subscription_id,usage_id,credits,status) values (p_user_id,s.id,p_usage_id,p_credits,'consumed');
  return true;
exception when unique_violation then
  return exists(select 1 from public.api_credit_events where usage_id=p_usage_id and status='consumed');
end;
$$;
revoke all on function public.consume_api_request_credit(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.consume_api_request_credit(uuid,uuid,integer) to service_role;

create or replace function public.settle_api_request_credit(p_usage_id uuid, p_actual_credits integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.api_credit_events%rowtype; delta integer;
begin
  if p_actual_credits < 1 or p_actual_credits > 100 then raise exception 'Invalid actual credit amount'; end if;
  select * into e from public.api_credit_events where usage_id=p_usage_id for update;
  if not found or e.status <> 'consumed' then return false; end if;
  delta := e.credits - p_actual_credits;
  if delta > 0 then
    update public.api_plan_subscriptions set credits_remaining=credits_remaining+delta, updated_at=now() where id=e.subscription_id;
  elsif delta < 0 then
    update public.api_plan_subscriptions set credits_remaining=credits_remaining+delta, updated_at=now()
      where id=e.subscription_id and credits_remaining >= -delta;
    if not found then return false; end if;
  end if;
  update public.api_credit_events set credits=p_actual_credits where id=e.id;
  return true;
end;
$$;
revoke all on function public.settle_api_request_credit(uuid,integer) from public, anon, authenticated;
grant execute on function public.settle_api_request_credit(uuid,integer) to service_role;
