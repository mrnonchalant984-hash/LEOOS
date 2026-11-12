# LeoX Store database

Migration: `supabase/migrations/20261110210000_leox_store_product_listings.sql`.

The migration is additive and creates `public.marketplace_products`, referencing existing `public.profiles(id)`. It stores title, description, category, price and currency independently, condition, country and city, seller ID, moderation state, and timestamps. Checks constrain field lengths, currency and country code formats, positive prices, condition values, and slug shape. Partial indexes support public listing/category/location queries; another index supports seller listing history.

RLS is enabled. Anonymous and authenticated roles can select active rows only. They receive no write privileges. Server writes use the existing service-role client after verifying the Supabase user; the server sets `seller_id` and `pending_review` itself. The update trigger maintains `updated_at` and publication timestamps.

Migration application and live RLS behavior have not been verified. Review and dry-run against staging, then apply through the approved database release process. No live database was modified.
