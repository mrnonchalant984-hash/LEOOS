create extension if not exists pgcrypto;

-- Additive migration: preserves the existing portfolio tables/data.
create table if not exists profiles (id uuid primary key references auth.users(id) on delete cascade, email text unique, full_name text, role text not null default 'user', created_at timestamptz not null default now(), twofa_secret text, twofa_verified boolean not null default false, backup_codes jsonb not null default '[]'::jsonb, admin_locked_until timestamptz);
create table if not exists subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, plan text not null, billing_period text not null, status text not null default 'active', current_period_start timestamptz, current_period_end timestamptz, paystack_subscription_code text, starts_at timestamptz, ends_at timestamptz, payment_reference text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists payments (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, amount numeric, currency text default 'NGN', plan text, billing_period text, paystack_reference text unique, reference text unique, status text default 'pending', paid_at timestamptz, verified_at timestamptz, amount_kobo bigint, created_at timestamptz default now());
create table if not exists credits (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, feature text not null, credits_remaining integer not null default 0, credits_used integer not null default 0, last_reset timestamptz default now(), unique(user_id,feature));
create table if not exists feature_access (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, feature_name text not null, has_access boolean not null default false, granted_by text, expires_at timestamptz, unique(user_id,feature_name));
create table if not exists projects (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, project_name text not null, type text, file_url text, files jsonb default '{}'::jsonb, status text default 'draft', progress integer default 0, created_at timestamptz default now());
create table if not exists admin_logs (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, action text not null, ip_address text, device text, created_at timestamptz default now());
create table if not exists chats_v2 (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, title text default 'New chat', messages jsonb not null default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, title text not null, body text not null, read boolean default false, created_at timestamptz default now());

create or replace function public.is_owner(uid uuid) returns boolean language sql security definer set search_path=public stable as $$ select exists(select 1 from public.profiles where id=uid and role='owner' and lower(email)=lower('leonardudoh5@gmail.com')); $$;

create table if not exists ai_usage (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, feature text not null, model text, prompt_tokens integer not null default 0, completion_tokens integer not null default 0, total_tokens integer not null default 0, credits_used integer not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists idx_ai_usage_created on ai_usage(created_at desc); create index if not exists idx_ai_usage_user_feature on ai_usage(user_id,feature,created_at desc);
alter table ai_usage enable row level security;
drop policy if exists ai_usage_self_or_owner on ai_usage;
create policy ai_usage_self_or_owner on ai_usage for select using(auth.uid()=user_id or public.is_owner(auth.uid()));

alter table profiles add column if not exists twofa_secret text; alter table profiles add column if not exists twofa_verified boolean not null default false; alter table profiles add column if not exists backup_codes jsonb not null default '[]'::jsonb; alter table profiles add column if not exists admin_locked_until timestamptz; alter table profiles add column if not exists admin_2fa_failed_attempts integer not null default 0;
alter table subscriptions add column if not exists current_period_start timestamptz; alter table subscriptions add column if not exists current_period_end timestamptz; alter table subscriptions add column if not exists paystack_subscription_code text; alter table subscriptions add column if not exists updated_at timestamptz default now();
alter table payments add column if not exists amount numeric; alter table payments add column if not exists currency text default 'NGN'; alter table payments add column if not exists paystack_reference text; alter table payments add column if not exists paid_at timestamptz;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,email,full_name,role) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','user'),case when lower(new.email)=lower('leonardudoh5@gmail.com') then 'owner' else 'user' end) on conflict(id) do update set email=excluded.email, role=case when lower(excluded.email)=lower('leonardudoh5@gmail.com') then 'owner' else profiles.role end; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
insert into public.profiles (id,email,full_name,role)
select id,email,coalesce(raw_user_meta_data->>'full_name','Leonard'),'owner'
from auth.users
where lower(email)=lower('leonardudoh5@gmail.com')
on conflict (id) do update set email=excluded.email,role='owner';
update profiles set role='user' where lower(email)<>lower('leonardudoh5@gmail.com') and role='owner';
create index if not exists idx_subscriptions_user_status on subscriptions(user_id,status); create index if not exists idx_payments_user_status on payments(user_id,status); create index if not exists idx_credits_user_feature on credits(user_id,feature); create index if not exists idx_feature_access_user on feature_access(user_id); create index if not exists idx_projects_user on projects(user_id); create index if not exists idx_admin_logs_user on admin_logs(user_id); create index if not exists idx_chats_v2_user_updated on chats_v2(user_id,updated_at desc);

alter table profiles enable row level security; alter table subscriptions enable row level security; alter table payments enable row level security; alter table credits enable row level security; alter table feature_access enable row level security; alter table projects enable row level security; alter table admin_logs enable row level security; alter table chats_v2 enable row level security; alter table notifications enable row level security;
drop policy if exists profiles_self_or_owner on profiles;
create policy profiles_self_or_owner on profiles for select using(auth.uid()=id or public.is_owner(auth.uid()));
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
drop policy if exists chats_v2_self on chats_v2;
create policy chats_v2_self on chats_v2 for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists notifications_self on notifications;
create policy notifications_self on notifications for select using(auth.uid()=user_id);
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
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table contacts enable row level security;
alter table leads enable row level security;
alter table testimonials enable row level security;
drop policy if exists contacts_public_insert on contacts;
create policy contacts_public_insert on contacts for insert with check (true);
drop policy if exists leads_public_insert on leads;
create policy leads_public_insert on leads for insert with check (true);
drop policy if exists testimonials_public_insert on testimonials;
create policy testimonials_public_insert on testimonials for insert with check (true);
drop policy if exists testimonials_public_approved_read on testimonials;
create policy testimonials_public_approved_read on testimonials for select using (status='approved' or public.is_owner(auth.uid()));

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
