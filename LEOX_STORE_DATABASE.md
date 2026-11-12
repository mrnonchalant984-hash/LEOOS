# LeoX Store database

Store schema is delivered by additive migrations under `supabase/migrations/`:

- `20261110210000_leox_store_product_listings.sql` — listings, inventory, moderation state, seller and public-listing policy.
- `20261111100000_leox_store_commerce.sql` — storefront, saved products, conversations, reports, reviews, and image/storage foundations.
- `20261111120000_leox_store_buying.sql` — carts, orders, stock reservations, payment application, and cancellation RPCs.
- `20261111130000_leox_store_seller_tools.sql` — seller tools, delivery options, seller metrics, and related policies.
- `20261111140000_leox_store_launch_workflows.sql` — fulfillment, disputes, seller verification, notifications, appeals, support, consent, and data-request records.

Migration-history output from a read-only Supabase CLI check showed local and remote versions in agreement through `20261111160000`. This is migration bookkeeping evidence only; it is not proof of the current target environment, actual grants/catalog state, RLS behavior, or recoverability.

The migrations enable RLS and define grants/policies, while application APIs use the service-role client with server-side authorization checks. Because service-role access bypasses RLS, cross-account API and direct authenticated-database tests remain required. No migration was applied during this reconciliation; do not apply or repair production migrations without explicit authorization.

See [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md) for data areas whose implementation or production status remains incomplete.
