# LeoX Store architecture

LeoX Store is an existing feature inside the LeonardX Next.js App Router application, not a separate replacement application. It reuses the site's auth/session helpers, server-side Supabase client, Postgres migrations, navigation, and UI conventions.

## Main surfaces

- Buyer discovery and details: `/store`, `/store/product/[slug]`, and `/store/seller/[id]`.
- Buyer workspace and purchase flow: `/store/account`, cart, `/store/checkout`, `/store/orders`, payment return, conversations, and disputes.
- Seller workspace: `/store/seller`, `/store/seller/products`, and `/store/seller/products/new`; product and image writes are gated on staff approval of seller verification.
- Owner work queue: `/api/admin/store` APIs guarded by existing owner access and verified 2FA.
- Data: additive `marketplace_*` tables, RPCs, policies, and storage configuration under `supabase/migrations/`.
- External payment: Paystack NGN checkout and server-side verification/webhook; checkout remains fail-closed until explicitly enabled.

## Trust boundaries

Browser requests authenticate through existing session helpers. Service-role operations are server-side and must enforce ownership/participant checks in application code. Migrations declare RLS and grants as a second boundary; run cross-account database tests before release. Seller selection during signup is only a destination preference; verified seller state is the authorization gate.

For an evidence-based feature-by-feature reconciliation and gaps, see [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md). No architecture description is a claim of production deployment.
