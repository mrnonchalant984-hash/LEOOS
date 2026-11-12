-- Existing profiles predate the signup trigger and may not have a platform
-- credit account. Create zero-balance accounts without granting new credits.
insert into public.platform_credit_accounts(user_id, balance, total_granted, total_spent)
select profile.id, 0, 0, 0
from public.profiles profile
left join public.platform_credit_accounts account on account.user_id = profile.id
where account.user_id is null
on conflict (user_id) do nothing;
