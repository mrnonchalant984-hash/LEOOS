create extension if not exists pgcrypto;

-- Additive migration: preserves the existing portfolio tables/data.
create table if not exists profiles (id uuid primary key references auth.users(id) on delete cascade, email text unique, full_name text, role text not null default 'user', created_at timestamptz not null default now(), twofa_secret text, twofa_verified boolean not null default false, backup_codes jsonb not null default '[]'::jsonb, admin_locked_until timestamptz);
create table if not exists subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, plan text not null, billing_period text not null, status text not null default 'active', current_period_start timestamptz, current_period_end timestamptz, paystack_subscription_code text, starts_at timestamptz, ends_at timestamptz, payment_reference text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists payments (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, amount numeric, currency text default 'NGN', plan text, billing_period text, paystack_reference text unique, reference text unique, status text default 'pending', paid_at timestamptz, verified_at timestamptz, amount_kobo bigint, created_at timestamptz default now());
create table if not exists credits (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, feature text not null, credits_remaining integer not null default 0, credits_used integer not null default 0, last_reset timestamptz default now(), unique(user_id,feature));
create table if not exists feature_access (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, feature_name text not null, has_access boolean not null default false, granted_by text, expires_at timestamptz, unique(user_id,feature_name));

create or replace function public.consume_user_credit(
  p_user_id uuid,
  p_feature text,
  p_cost integer,
  p_entitled boolean,
  p_free_monthly_allowance integer default 0
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  credit_row credits%rowtype;
  remaining integer;
begin
  if p_cost < 1 then raise exception 'Credit cost must be positive'; end if;
  if not p_entitled and p_free_monthly_allowance < 1 then
    raise exception 'This feature is not included in the current plan';
  end if;
  perform 1 from profiles where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;

  select * into credit_row from credits where user_id = p_user_id and feature = p_feature for update;
  if not found then
    if p_free_monthly_allowance < 1 then raise exception 'No credits left'; end if;
    insert into credits(user_id,feature,credits_remaining,credits_used,last_reset)
      values(p_user_id,p_feature,p_free_monthly_allowance,0,now()) returning * into credit_row;
  elsif p_free_monthly_allowance > 0 and (
    credit_row.last_reset < date_trunc('month',now())
    or (not p_entitled and credit_row.credits_remaining > p_free_monthly_allowance)
  ) then
    update credits set credits_remaining=p_free_monthly_allowance,credits_used=0,last_reset=now()
      where id=credit_row.id returning * into credit_row;
  end if;

  if credit_row.credits_remaining < p_cost then raise exception 'No credits left'; end if;
  update credits set credits_remaining=credits_remaining-p_cost,credits_used=credits_used+p_cost
    where id=credit_row.id returning credits_remaining into remaining;
  return remaining;
end;
$$;
revoke all on function public.consume_user_credit(uuid,text,integer,boolean,integer) from public, anon, authenticated;
grant execute on function public.consume_user_credit(uuid,text,integer,boolean,integer) to service_role;

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
  feature text;
begin
  select * into payment_row from payments where reference = p_reference for update;
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
      when coalesce(ends_at, current_period_end) > p_paid_at
        then coalesce(ends_at, current_period_end)
      else p_paid_at
    end),
    p_paid_at
  ) into period_start
  from subscriptions
  where user_id = payment_row.user_id and status = 'active';
  period_end := period_start + make_interval(months => period_months);
  update payments set status = 'success', paid_at = p_paid_at,
    verified_at = now(), paystack_reference = p_reference
    where id = payment_row.id;
  update subscriptions set status = 'expired'
    where user_id = payment_row.user_id and status = 'active';
  insert into subscriptions (user_id, plan, billing_period, status,
    current_period_start, current_period_end, starts_at, ends_at, payment_reference)
    values (payment_row.user_id, payment_row.plan, payment_row.billing_period,
      'active', period_start, period_end, period_start, period_end, p_reference);

  foreach feature in array array['image_generation', 'code_generation', 'background_removal', 'website_deployment'] loop
    insert into credits (user_id, feature, credits_remaining, credits_used, last_reset)
      values (payment_row.user_id, feature, plan_credits, 0, p_paid_at)
      on conflict (user_id, feature) do update set
        credits_remaining = excluded.credits_remaining,
        credits_used = 0,
        last_reset = excluded.last_reset;
    insert into feature_access (user_id, feature_name, has_access, granted_by, expires_at)
      values (payment_row.user_id, feature, true, 'subscription', period_end)
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

create table if not exists projects (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, project_name text not null, type text, file_url text, files jsonb default '{}'::jsonb, status text default 'draft', progress integer default 0, created_at timestamptz default now());
create table if not exists admin_logs (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, action text not null, ip_address text, device text, created_at timestamptz default now());
create table if not exists chats_v2 (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, title text default 'New chat', messages jsonb not null default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, title text not null, body text not null, read boolean default false, created_at timestamptz default now());
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  version text,
  summary text,
  description text not null,
  feature_list jsonb not null default '[]'::jsonb,
  image_url text,
  cta text,
  cta_url text,
  status text not null default 'draft',
  release_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists announcement_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  announcement_id uuid not null references announcements(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique(user_id, announcement_id)
);
create table if not exists upgrade_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  requested_by text not null,
  request text not null,
  repository text,
  branch text default 'main',
  status text not null default 'pending',
  files_changed integer default 0,
  files_added integer default 0,
  files_removed integer default 0,
  validation_result jsonb not null default '{}'::jsonb,
  build_result jsonb not null default '{}'::jsonb,
  deployment_result jsonb not null default '{}'::jsonb,
  commit_sha text,
  deployment_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists upgrade_changes (
  id uuid primary key default gen_random_uuid(),
  upgrade_job_id uuid not null references upgrade_jobs(id) on delete cascade,
  path text not null,
  action text not null default 'modified',
  created_at timestamptz not null default now()
);

create or replace function public.is_owner(uid uuid) returns boolean language sql security definer set search_path=public stable as $$ select exists(select 1 from public.profiles where id=uid and role='owner' and lower(email)=lower('leonardudoh5@gmail.com')); $$;

create table if not exists ai_usage (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, feature text not null, model text, prompt_tokens integer not null default 0, completion_tokens integer not null default 0, total_tokens integer not null default 0, credits_used integer not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists idx_ai_usage_created on ai_usage(created_at desc); create index if not exists idx_ai_usage_user_feature on ai_usage(user_id,feature,created_at desc);
alter table ai_usage enable row level security;
drop policy if exists ai_usage_self_or_owner on ai_usage;
create policy ai_usage_self_or_owner on ai_usage for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

alter table profiles add column if not exists twofa_secret text; alter table profiles add column if not exists twofa_verified boolean not null default false; alter table profiles add column if not exists backup_codes jsonb not null default '[]'::jsonb; alter table profiles add column if not exists admin_locked_until timestamptz; alter table profiles add column if not exists admin_2fa_failed_attempts integer not null default 0;
alter table subscriptions add column if not exists current_period_start timestamptz; alter table subscriptions add column if not exists current_period_end timestamptz; alter table subscriptions add column if not exists paystack_subscription_code text; alter table subscriptions add column if not exists updated_at timestamptz default now();
alter table payments add column if not exists amount numeric; alter table payments add column if not exists currency text default 'NGN'; alter table payments add column if not exists paystack_reference text; alter table payments add column if not exists paid_at timestamptz;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare
  safe_name text;
begin
  safe_name := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
  if safe_name is null or safe_name = '' then
    safe_name := 'there';
  end if;

  insert into public.profiles(id,email,full_name,role)
  values(new.id,new.email,safe_name,case when lower(new.email)=lower('leonardudoh5@gmail.com') then 'owner' else 'user' end)
  on conflict(id) do update set
    email=excluded.email,
    full_name=coalesce(nullif(excluded.full_name,''), profiles.full_name, split_part(excluded.email,'@',1)),
    role=case when lower(excluded.email)=lower('leonardudoh5@gmail.com') then 'owner' else profiles.role end;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
insert into public.profiles (id,email,full_name,role)
select id,email,coalesce(nullif(raw_user_meta_data->>'full_name',''), split_part(email,'@',1)),'owner'
from auth.users
where lower(email)=lower('leonardudoh5@gmail.com')
on conflict (id) do update set email=excluded.email,full_name=coalesce(nullif(excluded.full_name,''), profiles.full_name, split_part(excluded.email,'@',1)),role='owner';
update profiles set role='user' where lower(email)<>lower('leonardudoh5@gmail.com') and role='owner';
update profiles
set full_name = coalesce(
  nullif(trim(full_name), ''),
  nullif(split_part(email,'@',1), ''),
  'there'
)
where lower(coalesce(trim(full_name), '')) = 'user'
   or full_name is null
   or trim(full_name) = '';
create index if not exists idx_subscriptions_user_status on subscriptions(user_id,status); create index if not exists idx_payments_user_status on payments(user_id,status); create index if not exists idx_credits_user_feature on credits(user_id,feature); create index if not exists idx_feature_access_user on feature_access(user_id); create index if not exists idx_projects_user on projects(user_id); create index if not exists idx_admin_logs_user on admin_logs(user_id); create index if not exists idx_chats_v2_user_updated on chats_v2(user_id,updated_at desc);

alter table profiles enable row level security; alter table subscriptions enable row level security; alter table payments enable row level security; alter table credits enable row level security; alter table feature_access enable row level security; alter table projects enable row level security; alter table admin_logs enable row level security; alter table chats_v2 enable row level security; alter table notifications enable row level security;
alter table announcements enable row level security;
alter table announcement_reads enable row level security;
alter table upgrade_jobs enable row level security;
alter table upgrade_changes enable row level security;
alter table website_projects enable row level security;
revoke select on public.profiles from anon, authenticated;
drop policy if exists profiles_self_or_owner on profiles;
drop policy if exists profiles_self_safe_read on profiles;
revoke all on function public.is_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
drop policy if exists subscriptions_self_or_owner on subscriptions;
create policy subscriptions_self_or_owner on subscriptions for select using(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists payments_self_or_owner on payments;
create policy payments_self_or_owner on payments for select using(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists credits_self_or_owner on credits;
create policy credits_self_or_owner on credits for select using(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists feature_access_self_or_owner on feature_access;
create policy feature_access_self_or_owner on feature_access for select using(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists projects_self_or_owner on projects;
create policy projects_self_or_owner on projects for select using(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists projects_self_insert on projects;
create policy projects_self_insert on projects for insert with check(auth.uid()=user_id);
drop policy if exists projects_self_select on projects;
create policy projects_self_select on projects for select using(auth.uid()=user_id);
drop policy if exists chats_v2_self on chats_v2;
create policy chats_v2_self on chats_v2 for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists notifications_self on notifications;
create policy notifications_self on notifications for select using(auth.uid()=user_id);
drop policy if exists notifications_self_update on notifications;
create policy notifications_self_update on notifications for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists announcements_owner on announcements;
create policy announcements_owner on announcements for all using(public.is_owner(auth.uid())) with check(public.is_owner(auth.uid()));
drop policy if exists announcements_public_read on announcements;
create policy announcements_public_read on announcements for select using(status='published');
drop policy if exists announcement_reads_self on announcement_reads;
create policy announcement_reads_self on announcement_reads for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists upgrade_jobs_owner on upgrade_jobs;
create policy upgrade_jobs_owner on upgrade_jobs for all using(public.is_owner(auth.uid()) or auth.uid()=user_id) with check(public.is_owner(auth.uid()) or auth.uid()=user_id);
drop policy if exists upgrade_changes_owner on upgrade_changes;
create policy upgrade_changes_owner on upgrade_changes for all using(exists(select 1 from upgrade_jobs j where j.id=upgrade_job_id and (j.user_id=auth.uid() or public.is_owner(auth.uid())))) with check(exists(select 1 from upgrade_jobs j where j.id=upgrade_job_id and (j.user_id=auth.uid() or public.is_owner(auth.uid()))));
drop policy if exists website_projects_self_or_owner on website_projects;
create policy website_projects_self_or_owner on website_projects for select using(auth.uid()=owner_user_id or public.is_owner(auth.uid()));
drop policy if exists website_projects_self_insert on website_projects;
create policy website_projects_self_insert on website_projects for insert with check(auth.uid()=owner_user_id);
drop policy if exists admin_logs_owner on admin_logs;
create policy admin_logs_owner on admin_logs for select using(public.is_owner(auth.uid()));

insert into storage.buckets(id,name,public) values('leo-files','leo-files',false) on conflict(id) do nothing;


-- Public lead/contact/testimonial tables used by the portfolio forms.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service text not null,
  budget text not null,
  whatsapp text not null,
  chat_summary text default '',
  created_at timestamptz not null default now()
);
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  comment text not null,
  status text not null default 'published',
  created_at timestamptz not null default now()
);
alter table testimonials alter column status set default 'published';
update testimonials set status='published' where status='approved';
alter table contacts enable row level security;
alter table leads enable row level security;
alter table testimonials enable row level security;
drop policy if exists contacts_public_insert on contacts;
create policy contacts_public_insert on contacts for insert with check (true);
drop policy if exists leads_public_insert on leads;
create policy leads_public_insert on leads for insert with check (true);
drop policy if exists testimonials_public_insert on testimonials;
create policy testimonials_public_insert on testimonials for insert with check (
  status='published'
  and char_length(btrim(name)) between 2 and 80
  and char_length(btrim(company)) between 1 and 100
  and char_length(btrim(comment)) between 10 and 1200
);
drop policy if exists testimonials_public_approved_read on testimonials;
drop policy if exists testimonials_public_published_read on testimonials;
create policy testimonials_public_published_read on testimonials for select using (status='published');

-- LEO OS client website builder / hosting / onboarding extensions (additive)
create table if not exists website_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references profiles(id) on delete cascade,
  website_type text not null,
  business_name text,
  client_name text,
  client_email text,
  client_whatsapp text,
  country text,
  timezone text,
  currency_code text,
  currency_symbol text,
  chatbot_enabled boolean not null default false,
  payment_mode text not null default 'manual_email',
  custom_domain text,
  subdomain text,
  status text not null default 'draft',
  github_repo text,
  vercel_project_id text,
  live_url text,
  admin_url text,
  requirements jsonb not null default '{}'::jsonb,
  missing_requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_website_projects_owner on website_projects(owner_user_id,created_at desc);
update website_projects set payment_mode='manual_email' where payment_mode='manual_whatsapp';
create index if not exists idx_website_projects_status on website_projects(status);

alter table website_projects add column if not exists live_deployment_id text;
alter table website_projects add column if not exists suspended_deployment_id text;
alter table website_projects add column if not exists hosting_enforcement_status text default 'active';
alter table website_projects add column if not exists project_type text not null default 'website';
alter table website_projects add column if not exists build_provider text;
alter table website_projects add column if not exists build_status text not null default 'draft';
alter table website_projects add column if not exists build_step text;
alter table website_projects add column if not exists last_build_at timestamptz;
create index if not exists idx_website_projects_project_type on website_projects(owner_user_id,project_type,created_at desc);

create table if not exists project_builds (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  owner_user_id uuid not null references profiles(id) on delete cascade,
  project_type text not null,
  provider text not null,
  status text not null default 'building' check (status in ('building','testing','deploying','live','build_failed','deploy_failed')),
  step text not null default 'queued',
  logs jsonb not null default '[]'::jsonb,
  error text,
  deployment_id text,
  deployment_url text,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_project_builds_owner_created on project_builds(owner_user_id,created_at desc);
create index if not exists idx_project_builds_project_created on project_builds(website_project_id,created_at desc);

create or replace function public.create_customer_project(
  p_owner_user_id uuid,
  p_project_type text,
  p_website_type text,
  p_business_name text,
  p_chatbot_enabled boolean,
  p_payment_mode text,
  p_requirements jsonb,
  p_project_limit integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  project_id uuid;
  project_count integer;
begin
  if p_project_type not in ('website','web_app','saas') then
    raise exception 'Project type is not supported by a configured builder';
  end if;
  perform 1 from profiles where id = p_owner_user_id for update;
  if not found then raise exception 'Project owner profile was not found'; end if;
  select count(*) into project_count from website_projects where owner_user_id = p_owner_user_id;
  if project_count >= p_project_limit then raise exception 'Project limit reached'; end if;
  insert into website_projects(owner_user_id,project_type,website_type,business_name,chatbot_enabled,payment_mode,requirements)
    values(p_owner_user_id,p_project_type,p_website_type,p_business_name,p_chatbot_enabled,p_payment_mode,coalesce(p_requirements,'{}'::jsonb))
    returning id into project_id;
  return project_id;
end;
$$;
revoke all on function public.create_customer_project(uuid,text,text,text,boolean,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.create_customer_project(uuid,text,text,text,boolean,text,jsonb,integer) to service_role;

create or replace function public.start_customer_project_build(
  p_project_id uuid,
  p_owner_user_id uuid,
  p_provider text,
  p_monthly_limit integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  project_type_value text;
  build_count integer;
  build_id uuid;
begin
  perform 1 from profiles where id = p_owner_user_id for update;
  select project_type into project_type_value from website_projects
    where id = p_project_id and owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'Project not found'; end if;
  select count(*) into build_count from project_builds
    where owner_user_id = p_owner_user_id and created_at >= date_trunc('month', now());
  if build_count >= p_monthly_limit then raise exception 'Monthly build limit reached'; end if;
  insert into project_builds(website_project_id,owner_user_id,project_type,provider,status,step)
    values(p_project_id,p_owner_user_id,project_type_value,p_provider,'building','Generating source')
    returning id into build_id;
  update website_projects set build_provider=p_provider,build_status='building',build_step='Generating source',last_build_at=now(),updated_at=now()
    where id=p_project_id and owner_user_id=p_owner_user_id;
  return build_id;
end;
$$;
revoke all on function public.start_customer_project_build(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.start_customer_project_build(uuid,uuid,text,integer) to service_role;

alter table project_builds enable row level security;
drop policy if exists project_builds_owner_read on project_builds;
create policy project_builds_owner_read on project_builds for select using(auth.uid()=owner_user_id or public.is_owner(auth.uid()));

create table if not exists hosting_subscriptions (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  client_email text not null,
  plan text not null default 'free_trial',
  status text not null default 'trial',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  next_renewal_at timestamptz,
  paystack_reference text,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hosting_due on hosting_subscriptions(status,ends_at);

create or replace function public.start_project_hosting_trial(
  p_project_id uuid,
  p_owner_user_id uuid,
  p_client_email text,
  p_trial_days integer default 90
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  hosting_id uuid;
  trial_start timestamptz := now();
begin
  perform 1 from website_projects where id = p_project_id and owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'Project not found'; end if;
  select id into hosting_id from hosting_subscriptions
    where website_project_id = p_project_id order by created_at limit 1;
  if hosting_id is not null then return hosting_id; end if;
  insert into hosting_subscriptions(website_project_id,client_email,plan,status,starts_at,ends_at,next_renewal_at)
    values(p_project_id,coalesce(nullif(trim(p_client_email),''),'unknown'), 'free_trial','trial',trial_start,
      trial_start + make_interval(days => greatest(1,least(p_trial_days,90))),
      trial_start + make_interval(days => greatest(1,least(p_trial_days,90))))
    returning id into hosting_id;
  return hosting_id;
end;
$$;
revoke all on function public.start_project_hosting_trial(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.start_project_hosting_trial(uuid,uuid,text,integer) to service_role;

create table if not exists deployment_events (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  event_type text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_deployment_events_project on deployment_events(website_project_id,created_at desc);

create table if not exists website_credentials_audit (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  key_name text not null,
  key_scope text not null check (key_scope in ('public','secret')),
  configured boolean not null default false,
  configured_at timestamptz,
  created_at timestamptz not null default now()
);

alter table website_projects enable row level security;
alter table hosting_subscriptions enable row level security;
alter table deployment_events enable row level security;
alter table website_credentials_audit enable row level security;
drop policy if exists website_projects_self_or_owner on website_projects;
create policy website_projects_self_or_owner on website_projects for select using(auth.uid()=owner_user_id or public.is_owner(auth.uid()));
drop policy if exists website_projects_self_insert on website_projects;
create policy website_projects_self_insert on website_projects for insert with check(auth.uid()=owner_user_id);
drop policy if exists hosting_owner_or_project_owner on hosting_subscriptions;
create policy hosting_owner_or_project_owner on hosting_subscriptions for select using(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid()));
drop policy if exists deployment_owner_or_project_owner on deployment_events;
create policy deployment_owner_or_project_owner on deployment_events for select using(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid()));
drop policy if exists credential_audit_owner_or_project_owner on website_credentials_audit;
create policy credential_audit_owner_or_project_owner on website_credentials_audit for select using(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid()));

-- Client website intelligence extensions
create table if not exists website_chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  title text not null,
  content text not null,
  source_type text not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chatbot_knowledge_project on website_chatbot_knowledge(website_project_id,active);

create table if not exists website_chat_messages (
  id uuid primary key default gen_random_uuid(),
  website_project_id uuid not null references website_projects(id) on delete cascade,
  session_id text not null,
  role text not null check(role in ('user','assistant','system')),
  content text not null,
  unanswered boolean not null default false,
  visitor_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_project on website_chat_messages(website_project_id,created_at desc);

create table if not exists website_seo_settings (
  website_project_id uuid primary key references website_projects(id) on delete cascade,
  title text,
  description text,
  keywords text,
  social_image_url text,
  updated_at timestamptz not null default now()
);

alter table website_chatbot_knowledge enable row level security;
alter table website_chat_messages enable row level security;
alter table website_seo_settings enable row level security;
drop policy if exists chatbot_knowledge_owner on website_chatbot_knowledge;
create policy chatbot_knowledge_owner on website_chatbot_knowledge for all using(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid())) with check(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid()));
drop policy if exists chat_messages_owner on website_chat_messages;
create policy chat_messages_owner on website_chat_messages for select using(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid()));
drop policy if exists seo_settings_owner on website_seo_settings;
create policy seo_settings_owner on website_seo_settings for all using(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid())) with check(public.is_owner(auth.uid()) or exists(select 1 from website_projects w where w.id=website_project_id and w.owner_user_id=auth.uid()));

-- Persistent Leo memory and trusted admin devices (additive)
create table if not exists leo_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  memory text not null,
  source text not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leo_memories_user on leo_memories(user_id,active,updated_at desc);
alter table leo_memories enable row level security;
drop policy if exists leo_memories_self on leo_memories;
create policy leo_memories_self on leo_memories for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists admin_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  user_agent_hash text,
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_admin_trusted_devices_user on admin_trusted_devices(user_id,expires_at desc);
alter table admin_trusted_devices enable row level security;
drop policy if exists admin_trusted_devices_owner on admin_trusted_devices;
create policy admin_trusted_devices_owner on admin_trusted_devices for all using(public.is_owner(auth.uid())) with check(public.is_owner(auth.uid()));

-- Multi-agent orchestration (additive)
create table if not exists agent_definitions (id text primary key, name text not null, category text not null, description text not null, enabled boolean not null default true, owner_only boolean not null default false, allowed_tools jsonb not null default '[]'::jsonb, permissions jsonb not null default '[]'::jsonb, approval_required boolean not null default false, model text, config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists agent_tool_permissions (id uuid primary key default gen_random_uuid(), agent_id text not null references agent_definitions(id) on delete cascade, tool_id text not null, permission text not null, enabled boolean not null default true, created_at timestamptz not null default now(), unique(agent_id,tool_id));
create table if not exists agent_runs (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, agent_id text not null, task text not null, status text not null default 'queued', result text, error text, metadata jsonb not null default '{}'::jsonb, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now());
create table if not exists agent_run_steps (id uuid primary key default gen_random_uuid(), run_id uuid not null references agent_runs(id) on delete cascade, step_index integer not null, agent_id text not null, status text not null default 'queued', input jsonb not null default '{}'::jsonb, output jsonb, error text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now());
create table if not exists agent_approvals (id uuid primary key default gen_random_uuid(), run_id uuid references agent_runs(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade, action text not null, status text not null default 'pending', metadata jsonb not null default '{}'::jsonb, approved_at timestamptz, created_at timestamptz not null default now());
create index if not exists idx_agent_runs_user on agent_runs(user_id,created_at desc); create index if not exists idx_agent_runs_agent on agent_runs(agent_id,created_at desc); create index if not exists idx_agent_steps_run on agent_run_steps(run_id,step_index); create index if not exists idx_agent_approvals_user on agent_approvals(user_id,status,created_at desc);
alter table agent_definitions enable row level security; alter table agent_tool_permissions enable row level security; alter table agent_runs enable row level security; alter table agent_run_steps enable row level security; alter table agent_approvals enable row level security;
drop policy if exists agent_definitions_owner on agent_definitions; create policy agent_definitions_owner on agent_definitions for all using(public.is_owner(auth.uid())) with check(public.is_owner(auth.uid()));
drop policy if exists agent_tools_owner on agent_tool_permissions; create policy agent_tools_owner on agent_tool_permissions for all using(public.is_owner(auth.uid())) with check(public.is_owner(auth.uid()));
drop policy if exists agent_runs_self on agent_runs; create policy agent_runs_self on agent_runs for select using(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists agent_steps_self on agent_run_steps; create policy agent_steps_self on agent_run_steps for select using(exists(select 1 from agent_runs r where r.id=run_id and (r.user_id=auth.uid() or public.is_owner(auth.uid()))));
drop policy if exists agent_approvals_self on agent_approvals; create policy agent_approvals_self on agent_approvals for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

-- Owner-only hosted browser session tracking for Leo's computer-use runtime.
create table if not exists agent_browser_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete cascade,
  provider text not null default 'openai_hosted',
  session_id text not null unique,
  status text not null default 'running',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table agent_browser_sessions enable row level security;
drop policy if exists agent_browser_sessions_owner on agent_browser_sessions;
create policy agent_browser_sessions_owner on agent_browser_sessions for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));
create index if not exists idx_agent_browser_sessions_user on agent_browser_sessions(user_id,created_at desc);

-- LEO OS platform control-plane extensions (additive; run after existing schema)
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  name text not null, prefix text not null, key_hash text not null unique, scopes jsonb not null default '["read"]'::jsonb,
  revoked boolean not null default false, expires_at timestamptz, last_used_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_api_keys_user on api_keys(user_id,created_at desc);
alter table api_keys enable row level security;
drop policy if exists api_keys_self on api_keys;
create policy api_keys_self on api_keys for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists system_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null,
  organization_id uuid, project_id uuid, kind text not null, title text not null, severity text not null default 'INFO',
  request_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_system_events_user on system_events(user_id,created_at desc);
create index if not exists idx_system_events_kind on system_events(kind,created_at desc);
alter table system_events enable row level security;
drop policy if exists system_events_self on system_events;
create policy system_events_self on system_events for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists error_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null,
  request_id text, environment text not null default 'production', route text, severity text not null default 'ERROR',
  error_type text, message text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_error_events_user on error_events(user_id,created_at desc);
alter table error_events enable row level security;
drop policy if exists error_events_owner on error_events;
create policy error_events_owner on error_events for select using(public.is_owner(auth.uid()) or auth.uid()=user_id);

create table if not exists background_tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  kind text not null, status text not null default 'queued', progress integer not null default 0,
  payload jsonb not null default '{}'::jsonb, result jsonb, error text, request_id text,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_background_tasks_user on background_tasks(user_id,created_at desc);
alter table background_tasks enable row level security;
drop policy if exists background_tasks_self on background_tasks;
create policy background_tasks_self on background_tasks for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  name text not null, endpoint_url text not null, secret_hash text not null, events jsonb not null default '[]'::jsonb,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(), webhook_id uuid not null references webhooks(id) on delete cascade,
  event_type text not null, status text not null default 'queued', attempt integer not null default 0, response_code integer,
  response_body text, delivered_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_webhooks_user on webhooks(user_id,created_at desc);
create index if not exists idx_webhook_deliveries_webhook on webhook_deliveries(webhook_id,created_at desc);
alter table webhooks enable row level security;
alter table webhook_deliveries enable row level security;
drop policy if exists webhooks_self on webhooks;
create policy webhooks_self on webhooks for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists webhook_deliveries_self on webhook_deliveries;
create policy webhook_deliveries_self on webhook_deliveries for select using(exists(select 1 from webhooks w where w.id=webhook_id and (w.user_id=auth.uid() or public.is_owner(auth.uid()))));

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  owner_user_id uuid not null references profiles(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade, role text not null default 'VIEWER', created_at timestamptz not null default now(),
  unique(organization_id,user_id)
);
create index if not exists idx_org_members_user on organization_members(user_id,created_at desc);
alter table organizations enable row level security;
alter table organization_members enable row level security;
drop policy if exists organizations_member on organizations;
create policy organizations_member on organizations for select using(owner_user_id=auth.uid() or exists(select 1 from organization_members m where m.organization_id=id and m.user_id=auth.uid()) or public.is_owner(auth.uid()));
drop policy if exists organization_members_member on organization_members;
create policy organization_members_member on organization_members for select using(user_id=auth.uid() or exists(select 1 from organizations o where o.id=organization_id and o.owner_user_id=auth.uid()) or public.is_owner(auth.uid()));

-- LEO OS API v2 additive control-plane migration
create table if not exists api_request_logs (
  id uuid primary key default gen_random_uuid(), key_id uuid references api_keys(id) on delete set null,
  user_id uuid references profiles(id) on delete set null, request_id text not null,
  method text not null, route text not null, status_code integer, latency_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_request_logs_user on api_request_logs(user_id,created_at desc);
create index if not exists idx_api_request_logs_key on api_request_logs(key_id,created_at desc);
alter table api_request_logs enable row level security;
drop policy if exists api_request_logs_self on api_request_logs;
create policy api_request_logs_self on api_request_logs for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

alter table api_keys add column if not exists description text;
alter table api_keys add column if not exists environment text not null default 'production';
alter table webhooks add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- LEONARD X / LEO OS V2 PLATFORM + PRODUCTION HARDENING
-- Canonical additive schema: run this file against the existing
-- LEO OS Supabase PostgreSQL database. Safe to re-run.
-- ============================================================

-- LEO OS platform control-plane extensions (additive; run after existing schema)
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  name text not null, prefix text not null, key_hash text not null unique, scopes jsonb not null default '["read"]'::jsonb,
  revoked boolean not null default false, expires_at timestamptz, last_used_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_api_keys_user on api_keys(user_id,created_at desc);
alter table api_keys enable row level security;
drop policy if exists api_keys_self on api_keys;
create policy api_keys_self on api_keys for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists system_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null,
  organization_id uuid, project_id uuid, kind text not null, title text not null, severity text not null default 'INFO',
  request_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_system_events_user on system_events(user_id,created_at desc);
create index if not exists idx_system_events_kind on system_events(kind,created_at desc);
alter table system_events enable row level security;
drop policy if exists system_events_self on system_events;
create policy system_events_self on system_events for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists error_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id) on delete set null,
  request_id text, environment text not null default 'production', route text, severity text not null default 'ERROR',
  error_type text, message text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_error_events_user on error_events(user_id,created_at desc);
alter table error_events enable row level security;
drop policy if exists error_events_owner on error_events;
create policy error_events_owner on error_events for select using(public.is_owner(auth.uid()) or auth.uid()=user_id);

create table if not exists background_tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  kind text not null, status text not null default 'queued', progress integer not null default 0,
  payload jsonb not null default '{}'::jsonb, result jsonb, error text, request_id text,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_background_tasks_user on background_tasks(user_id,created_at desc);
alter table background_tasks enable row level security;
drop policy if exists background_tasks_self on background_tasks;
create policy background_tasks_self on background_tasks for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  name text not null, endpoint_url text not null, secret_hash text not null, events jsonb not null default '[]'::jsonb,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(), webhook_id uuid not null references webhooks(id) on delete cascade,
  event_type text not null, status text not null default 'queued', attempt integer not null default 0, response_code integer,
  response_body text, delivered_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_webhooks_user on webhooks(user_id,created_at desc);
create index if not exists idx_webhook_deliveries_webhook on webhook_deliveries(webhook_id,created_at desc);
alter table webhooks enable row level security;
alter table webhook_deliveries enable row level security;
drop policy if exists webhooks_self on webhooks;
create policy webhooks_self on webhooks for all using(auth.uid()=user_id or public.is_owner(auth.uid())) with check(auth.uid()=user_id or public.is_owner(auth.uid()));
drop policy if exists webhook_deliveries_self on webhook_deliveries;
create policy webhook_deliveries_self on webhook_deliveries for select using(exists(select 1 from webhooks w where w.id=webhook_id and (w.user_id=auth.uid() or public.is_owner(auth.uid()))));

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  owner_user_id uuid not null references profiles(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade, role text not null default 'VIEWER', created_at timestamptz not null default now(),
  unique(organization_id,user_id)
);
create index if not exists idx_org_members_user on organization_members(user_id,created_at desc);
alter table organizations enable row level security;
alter table organization_members enable row level security;
drop policy if exists organizations_member on organizations;
create policy organizations_member on organizations for select using(owner_user_id=auth.uid() or exists(select 1 from organization_members m where m.organization_id=id and m.user_id=auth.uid()) or public.is_owner(auth.uid()));
drop policy if exists organization_members_member on organization_members;
create policy organization_members_member on organization_members for select using(user_id=auth.uid() or exists(select 1 from organizations o where o.id=organization_id and o.owner_user_id=auth.uid()) or public.is_owner(auth.uid()));

-- LEO OS V2 production hardening migration.
-- Run after supabase/leo-os-v2-platform.sql. Safe to re-run.

alter table public.api_keys add column if not exists description text;
alter table public.api_keys add column if not exists environment text not null default 'production';
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);

alter table public.webhooks add column if not exists secret_encrypted text;
alter table public.webhooks add column if not exists updated_at timestamptz not null default now();

create table if not exists public.api_rate_limits (
  key_id uuid primary key references public.api_keys(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.api_rate_limits enable row level security;
drop policy if exists api_rate_limits_self on public.api_rate_limits;
create policy api_rate_limits_self on public.api_rate_limits for select using(exists(select 1 from public.api_keys k where k.id=key_id and (k.user_id=auth.uid() or public.is_owner(auth.uid()))));

create or replace function public.consume_api_rate_limit(p_key_id uuid, p_limit integer default 120, p_window_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.api_rate_limits; now_ts timestamptz := clock_timestamp();
begin
  select * into r from public.api_rate_limits where key_id=p_key_id for update;
  if not found then
    insert into public.api_rate_limits(key_id,window_started_at,request_count,updated_at) values(p_key_id,now_ts,1,now_ts) on conflict(key_id) do nothing;
    return true;
  end if;
  if extract(epoch from (now_ts-r.window_started_at)) >= p_window_seconds then
    update public.api_rate_limits set window_started_at=now_ts,request_count=1,updated_at=now_ts where key_id=p_key_id;
    return true;
  end if;
  if r.request_count >= p_limit then return false; end if;
  update public.api_rate_limits set request_count=request_count+1,updated_at=now_ts where key_id=p_key_id;
  return true;
end; $$;
revoke all on function public.consume_api_rate_limit(uuid,integer,integer) from public;
grant execute on function public.consume_api_rate_limit(uuid,integer,integer) to service_role;

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_webhook_events_user_created on public.webhook_events(user_id,created_at desc);
alter table public.webhook_events enable row level security;
drop policy if exists webhook_events_self on public.webhook_events;
create policy webhook_events_self on public.webhook_events for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

alter table public.webhook_deliveries add column if not exists next_attempt_at timestamptz;
alter table public.webhook_deliveries add column if not exists last_error text;
create index if not exists idx_webhook_deliveries_queue on public.webhook_deliveries(status,next_attempt_at,created_at);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  severity text not null default 'INFO',
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_security_events_user_created on public.security_events(user_id,created_at desc);
alter table public.security_events enable row level security;
drop policy if exists security_events_self on public.security_events;
create policy security_events_self on public.security_events for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

-- Prevent direct client-side exposure of API key hashes/secrets through PostgREST.
revoke all on public.api_keys from anon;
revoke all on public.api_keys from authenticated;
revoke all on public.webhooks from anon;
revoke all on public.webhooks from authenticated;
revoke all on public.api_rate_limits from anon;
revoke all on public.webhook_events from anon;
revoke all on public.security_events from anon;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_webhooks_updated_at on public.webhooks;
create trigger trg_webhooks_updated_at before update on public.webhooks for each row execute function public.set_updated_at();
