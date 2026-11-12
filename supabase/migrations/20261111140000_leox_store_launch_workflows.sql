-- Marketplace launch workflows. External courier, payout, tax and legal decisions remain configuration gates.
create table if not exists public.marketplace_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'processing' check (status in ('processing','shipped','delivered','delivery_issue','cancelled')),
  method text not null default 'seller_delivery' check (method in ('seller_delivery','courier','pickup')),
  courier_name text check (length(courier_name) <= 100),
  tracking_reference text check (length(tracking_reference) <= 200),
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  delivery_notes text not null default '' check (length(delivery_notes) <= 2000),
  issue_details text check (length(issue_details) <= 2000),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(order_id,seller_id)
);
create table if not exists public.marketplace_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 3 and 100),
  details text not null check (length(btrim(details)) between 3 and 4000),
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  resolution text check(length(resolution) <= 4000),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.marketplace_report_appeals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.marketplace_reports(id) on delete restrict,
  appellant_id uuid not null references public.profiles(id) on delete restrict,
  details text not null check(length(btrim(details)) between 10 and 3000),
  status text not null default 'open' check(status in ('open','reviewing','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(report_id,appellant_id)
);
create table if not exists public.marketplace_seller_verification_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  business_name text not null check(length(btrim(business_name)) between 2 and 120),
  country_code char(2) not null check(country_code ~ '^[A-Z]{2}$'),
  details text not null default '' check(length(details) <= 2000),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewer_id uuid references public.profiles(id),
  reviewer_note text check(length(reviewer_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketplace_seller_one_open_verification on public.marketplace_seller_verification_requests(seller_id) where status='pending';
create table if not exists public.marketplace_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check(length(btrim(subject)) between 3 and 160),
  message text not null check(length(btrim(message)) between 10 and 5000),
  status text not null default 'open' check(status in ('open','working','resolved','closed')),
  staff_reply text check(length(staff_reply) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.marketplace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(length(kind) between 2 and 60),
  title text not null check(length(title) between 1 and 160),
  body text not null default '' check(length(body) <= 1000),
  href text check(href is null or href like '/%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.marketplace_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_key text not null check(consent_key in ('terms','privacy','marketing')),
  version text not null check(length(version) between 1 and 40),
  granted boolean not null,
  created_at timestamptz not null default now()
);
create table if not exists public.marketplace_data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  request_type text not null check(request_type in ('export','deletion')),
  status text not null default 'open' check(status in ('open','working','completed','declined')),
  note text check(length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketplace_data_request_one_open on public.marketplace_data_requests(user_id,request_type) where status in ('open','working');
create table if not exists public.marketplace_prohibited_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique check(length(btrim(term)) between 2 and 100),
  category text not null default 'review' check(length(category) <= 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.marketplace_notification_preferences add column if not exists order_updates boolean not null default true;
alter table public.marketplace_notification_preferences add column if not exists support_updates boolean not null default true;

do $$ declare t text; begin
  foreach t in array array['marketplace_fulfillments','marketplace_disputes','marketplace_report_appeals','marketplace_seller_verification_requests','marketplace_support_tickets','marketplace_notifications','marketplace_consents','marketplace_data_requests','marketplace_prohibited_terms'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant select,insert on public.marketplace_disputes,public.marketplace_report_appeals,public.marketplace_seller_verification_requests,public.marketplace_support_tickets,public.marketplace_data_requests,public.marketplace_consents to authenticated;
grant select,update on public.marketplace_notifications to authenticated;
grant select on public.marketplace_fulfillments to authenticated;
create policy marketplace_fulfillment_participant_read on public.marketplace_fulfillments for select to authenticated using (
  seller_id=auth.uid() or exists(select 1 from public.marketplace_orders o where o.id=marketplace_fulfillments.order_id and o.buyer_id=auth.uid())
);
create policy marketplace_dispute_participant_read on public.marketplace_disputes for select to authenticated using (
  opened_by=auth.uid() or exists(select 1 from public.marketplace_orders o where o.id=marketplace_disputes.order_id and o.buyer_id=auth.uid()) or exists(select 1 from public.marketplace_order_items i where i.order_id=marketplace_disputes.order_id and i.seller_id=auth.uid())
);
create policy marketplace_appeal_member_read on public.marketplace_report_appeals for select to authenticated using(appellant_id=auth.uid());
create policy marketplace_verification_owner_read on public.marketplace_seller_verification_requests for select to authenticated using(seller_id=auth.uid());
create policy marketplace_support_owner_read on public.marketplace_support_tickets for select to authenticated using(user_id=auth.uid());
create policy marketplace_notifications_owner on public.marketplace_notifications for select to authenticated using(user_id=auth.uid());
create policy marketplace_notifications_mark_read on public.marketplace_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy marketplace_consents_owner_read on public.marketplace_consents for select to authenticated using(user_id=auth.uid());
create policy marketplace_data_request_owner_read on public.marketplace_data_requests for select to authenticated using(user_id=auth.uid());
create policy marketplace_prohibited_terms_owner_read on public.marketplace_prohibited_terms for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.twofa_verified=true));
