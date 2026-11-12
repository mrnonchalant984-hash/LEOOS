-- Additive foundation for LeoX Store public listings and seller submissions.
-- Product records start in pending_review and are not public until approved.

create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text not null check (length(btrim(description)) between 10 and 5000),
  category text not null check (length(btrim(category)) between 1 and 80),
  price numeric(14, 2) not null check (price > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  condition text not null check (condition in ('new', 'used', 'refurbished')),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  region text check (region is null or length(region) <= 100),
  city text not null check (length(btrim(city)) between 1 and 100),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'active', 'rejected', 'paused', 'sold', 'removed')),
  moderation_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active') = (published_at is not null))
);

create index if not exists marketplace_products_public_created_idx
  on public.marketplace_products (created_at desc)
  where status = 'active';
create index if not exists marketplace_products_public_category_idx
  on public.marketplace_products (category, created_at desc)
  where status = 'active';
create index if not exists marketplace_products_public_location_idx
  on public.marketplace_products (country_code, city, created_at desc)
  where status = 'active';
create index if not exists marketplace_products_seller_created_idx
  on public.marketplace_products (seller_id, created_at desc);

alter table public.marketplace_products enable row level security;
revoke all on table public.marketplace_products from public, anon, authenticated;
grant select on table public.marketplace_products to anon, authenticated;
grant all on table public.marketplace_products to service_role;

drop policy if exists marketplace_products_public_read on public.marketplace_products;
create policy marketplace_products_public_read
  on public.marketplace_products
  for select to anon, authenticated
  using (status = 'active');

create or replace function public.set_marketplace_product_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if new.status = 'active' and new.published_at is null then
    new.published_at = now();
  elsif new.status <> 'active' then
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_products_updated_at on public.marketplace_products;
create trigger marketplace_products_updated_at
  before update on public.marketplace_products
  for each row execute function public.set_marketplace_product_updated_at();

revoke all on function public.set_marketplace_product_updated_at() from public, anon, authenticated;
