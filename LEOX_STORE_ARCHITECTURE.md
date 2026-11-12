# LeoX Store architecture

## Audit snapshot

The repository is an existing Next.js 16 App Router application named LeonardX. It uses Supabase Auth, a server-side Supabase service-role helper, Postgres migrations under `supabase/migrations/`, TypeScript, Tailwind CSS, and the existing root layout, navigation, and visual theme. At the start of this work there were no Store routes or Store-specific migrations.

## Implemented vertical slice

- `/store` reads active product listings from Postgres, supports title and category filters, and reports an unavailable database instead of showing sample inventory.
- `/store/product/[slug]` exposes only active listings and adds canonical metadata and Product structured data.
- `/store/seller/products/new` submits a product through the existing session-cookie authentication. The server chooses the seller ID and creates listings as `pending_review`.
- `/api/store/products` provides public active-listing reads and authenticated listing submission.
- The additive migration creates the listing table, validation constraints, indexes, public-read RLS policy, and an update timestamp trigger.

The broader LeoX Store master prompt describes substantially more functionality than this release slice. See [LEOX_STORE_KNOWN_ISSUES.md](./LEOX_STORE_KNOWN_ISSUES.md).
