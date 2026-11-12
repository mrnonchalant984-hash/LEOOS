-- LeoX Store commerce foundation. Apply only after confirming the target is staging.
-- Existing listings remain pending until an authorized moderator approves them.

create table if not exists public.marketplace_sellers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  bio text not null default '' check (length(bio) <= 2000),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_products add column if not exists image_urls text[] not null default '{}';
alter table public.marketplace_products add column if not exists view_count bigint not null default 0 check (view_count >= 0);

create table if not exists public.marketplace_saved_products (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.marketplace_delivery_options (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.marketplace_products(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  details text not null default '' check (length(details) <= 500),
  price numeric(14,2) not null default 0 check (price >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  blocked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id),
  check (buyer_id <> seller_id)
);

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  attachment_path text check (attachment_path is null or length(attachment_path) <= 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists marketplace_messages_conversation_idx on public.marketplace_messages(conversation_id, created_at desc);

create table if not exists public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.marketplace_products(id) on delete cascade,
  conversation_id uuid references public.marketplace_conversations(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 3 and 80),
  details text not null default '' check (length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(product_id, conversation_id) = 1)
);

create table if not exists public.marketplace_moderation_audit (
  id bigint generated always as identity primary key,
  moderator_id uuid not null references public.profiles(id),
  product_id uuid references public.marketplace_products(id) on delete set null,
  report_id uuid references public.marketplace_reports(id) on delete set null,
  action text not null check (action in ('approve','reject','remove','restore','report_resolve','report_dismiss','verify_seller')),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now()
);

create or replace function public.moderate_marketplace_product(
  p_moderator_id uuid, p_product_id uuid, p_status text, p_action text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_moderator_id and role = 'owner') then
    raise exception 'moderator is not authorized';
  end if;
  if p_status not in ('active','rejected','removed','pending_review') or p_action not in ('approve','reject','remove','restore') then
    raise exception 'invalid moderation action';
  end if;
  update public.marketplace_products
     set status = p_status,
         moderation_note = nullif(p_note, ''),
         published_at = case when p_status = 'active' then now() else null end
   where id = p_product_id
   returning jsonb_build_object('id', id, 'slug', slug, 'status', status) into result;
  if result is null then raise exception 'listing not found'; end if;
  insert into public.marketplace_moderation_audit(moderator_id, product_id, action, note)
    values (p_moderator_id, p_product_id, p_action, coalesce(p_note, ''));
  return result;
end;
$$;
revoke all on function public.moderate_marketplace_product(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.moderate_marketplace_product(uuid, uuid, text, text, text) to service_role;

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now(),
  unique (product_id, reviewer_id)
);

create table if not exists public.marketplace_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  listing_updates boolean not null default true,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.marketplace_sellers enable row level security;
alter table public.marketplace_saved_products enable row level security;
alter table public.marketplace_delivery_options enable row level security;
alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_messages enable row level security;
alter table public.marketplace_reports enable row level security;
alter table public.marketplace_moderation_audit enable row level security;
alter table public.marketplace_reviews enable row level security;
alter table public.marketplace_notification_preferences enable row level security;

revoke all on public.marketplace_sellers, public.marketplace_saved_products, public.marketplace_delivery_options,
  public.marketplace_conversations, public.marketplace_messages, public.marketplace_reports,
  public.marketplace_moderation_audit, public.marketplace_reviews, public.marketplace_notification_preferences
  from public, anon, authenticated;
grant all on public.marketplace_sellers, public.marketplace_saved_products, public.marketplace_delivery_options,
  public.marketplace_conversations, public.marketplace_messages, public.marketplace_reports,
  public.marketplace_reviews, public.marketplace_notification_preferences to service_role;
grant select on public.marketplace_sellers, public.marketplace_delivery_options, public.marketplace_reviews to anon, authenticated;
grant select, insert, update, delete on public.marketplace_saved_products to authenticated;
grant select, insert on public.marketplace_conversations, public.marketplace_messages to authenticated;
grant update (read_at) on public.marketplace_messages to authenticated;
grant insert on public.marketplace_reports to authenticated;
grant select on public.marketplace_moderation_audit to authenticated;
grant select, insert, update on public.marketplace_notification_preferences to authenticated;
grant usage, select on sequence public.marketplace_moderation_audit_id_seq to service_role;

create policy marketplace_sellers_public_read on public.marketplace_sellers for select to anon, authenticated using (true);
create policy marketplace_sellers_owner_write on public.marketplace_sellers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy marketplace_saved_owner on public.marketplace_saved_products for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy marketplace_delivery_public_read on public.marketplace_delivery_options for select to anon, authenticated using (active and exists (select 1 from public.marketplace_products p where p.id = product_id and p.status = 'active'));
create policy marketplace_conversation_members on public.marketplace_conversations for select to authenticated using (auth.uid() in (buyer_id, seller_id));
create policy marketplace_messages_members_read on public.marketplace_messages for select to authenticated using (exists (select 1 from public.marketplace_conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
create policy marketplace_messages_members_insert on public.marketplace_messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.marketplace_conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id,c.seller_id) and c.blocked_by is null));
create policy marketplace_messages_member_read_update on public.marketplace_messages for update to authenticated
  using (sender_id <> auth.uid() and exists (select 1 from public.marketplace_conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id,c.seller_id)))
  with check (sender_id <> auth.uid() and exists (select 1 from public.marketplace_conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
create policy marketplace_reports_reporter_insert on public.marketplace_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy marketplace_audit_moderator_select on public.marketplace_moderation_audit for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.twofa_verified = true));
create policy marketplace_reviews_public_read on public.marketplace_reviews for select to anon, authenticated using (true);
create policy marketplace_preferences_owner on public.marketplace_notification_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private message attachment bucket. The API must issue participant-scoped signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-private', 'marketplace-private', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-products', 'marketplace-products', true, 6291456, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists marketplace_product_image_public_read on storage.objects;
create policy marketplace_product_image_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'marketplace-products');
drop policy if exists marketplace_product_image_owner_insert on storage.objects;
create policy marketplace_product_image_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'marketplace-products' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists marketplace_product_image_owner_delete on storage.objects;
create policy marketplace_product_image_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'marketplace-products' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists marketplace_private_attachment_read on storage.objects;
create policy marketplace_private_attachment_read on storage.objects for select to authenticated using (
  bucket_id = 'marketplace-private' and exists (
    select 1 from public.marketplace_conversations c
    where auth.uid() in (c.buyer_id,c.seller_id) and name like c.id::text || '/%'
  )
);
drop policy if exists marketplace_private_attachment_insert on storage.objects;
create policy marketplace_private_attachment_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'marketplace-private' and exists (
    select 1 from public.marketplace_conversations c
    where auth.uid() in (c.buyer_id,c.seller_id) and c.blocked_by is null and name like c.id::text || '/%'
  )
);

