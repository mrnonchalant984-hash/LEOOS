-- Braverton Market seller-entered storefront contact and delivery details.
-- These fields are explicitly supplied by the seller; never copy private account phone data.
alter table public.marketplace_sellers
  add column if not exists whatsapp_number text,
  add column if not exists contact_email text,
  add column if not exists location_text text,
  add column if not exists delivery_details text;

alter table public.marketplace_sellers
  drop constraint if exists marketplace_sellers_whatsapp_number_format;
alter table public.marketplace_sellers
  add constraint marketplace_sellers_whatsapp_number_format
  check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');

alter table public.marketplace_sellers
  drop constraint if exists marketplace_sellers_contact_email_format;
alter table public.marketplace_sellers
  add constraint marketplace_sellers_contact_email_format
  check (contact_email is null or (length(contact_email) <= 254 and contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'));

alter table public.marketplace_sellers
  drop constraint if exists marketplace_sellers_location_text_length;
alter table public.marketplace_sellers
  add constraint marketplace_sellers_location_text_length
  check (location_text is null or length(location_text) <= 180);

alter table public.marketplace_sellers
  drop constraint if exists marketplace_sellers_delivery_details_length;
alter table public.marketplace_sellers
  add constraint marketplace_sellers_delivery_details_length
  check (delivery_details is null or length(delivery_details) <= 1200);
