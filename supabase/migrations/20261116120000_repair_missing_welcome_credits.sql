-- Repair accounts created before the signup bonus trigger/backfill was installed.
-- Only profiles with no prior grant and a zero balance are eligible; existing balances are preserved.
do $$
declare
  target record;
  new_balance integer;
begin
  for target in
    select p.id
    from public.profiles p
    left join public.platform_credit_accounts a on a.user_id = p.id
    where coalesce(lower(p.role), 'user') <> 'owner'
      and (a.user_id is null or (a.balance = 0 and a.total_granted = 0))
      and not exists (
        select 1 from public.platform_credit_ledger l
        where l.user_id = p.id and l.idempotency_key = 'welcome-bonus-v1'
      )
  loop
    insert into public.platform_credit_accounts(user_id, balance, total_granted, total_spent)
      values (target.id, 0, 0, 0)
      on conflict (user_id) do nothing;

    update public.platform_credit_accounts
      set balance = balance + 50,
          total_granted = total_granted + 50,
          updated_at = now()
      where user_id = target.id
        and balance = 0
        and total_granted = 0
        and not exists (
          select 1 from public.platform_credit_ledger l
          where l.user_id = target.id and l.idempotency_key = 'welcome-bonus-v1'
        )
      returning balance into new_balance;

    if found then
      insert into public.platform_credit_ledger(
        user_id, amount, event_type, source, idempotency_key, balance_after, metadata
      ) values (
        target.id, 50, 'grant', 'signup_welcome_bonus', 'welcome-bonus-v1',
        new_balance, jsonb_build_object('bonus_credits', 50, 'repair_migration', '20261116120000')
      ) on conflict (user_id, idempotency_key) do nothing;
    end if;
  end loop;
end;
$$;
