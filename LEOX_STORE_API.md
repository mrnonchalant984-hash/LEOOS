# LeoX Store API

This is an API map, not the complete release gate. See [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md) for the authoritative feature and production status. Routes use the existing Leo session/auth helpers and server-side Supabase service client; individual endpoints apply their own ownership, verified-seller, rate-limit, and owner/2FA checks.

## Discovery and listings

- `GET /api/store/products` — active products; supports text, category, country, region, city, currency, min/max price, page, and bounded page size. Public responses are briefly cached.
- `POST /api/store/products` — verified seller submits a validated listing as `pending_review`; accepts seller-owned image paths (up to eight).
- `GET /api/store/seller/products` — caller's listings and inventory.
- `PATCH /api/store/seller/products/[id]` — seller edits details/quantity or pauses, resumes for review, or marks a listing sold.
- `POST /api/store/images` — verified seller uploads a JPEG/PNG/WebP up to 2 MB; output is resized and compressed to WebP up to 700 KB.
- `DELETE /api/store/images` — deletes only the authenticated seller's unreferenced images.
- `GET /api/store/seller/dashboard` and seller delivery routes — paid-sales metrics and active seller delivery options; fees are selected and collected in checkout.
- `/api/store/seller/orders` and `/store/seller/orders` — seller order management and seller-entered tracking. Delivery remains seller-arranged; no courier booking integration is used.
- `/api/store/seller/payout-account` — verified seller configures a Paystack transfer recipient; account details are not stored beyond bank code, account name, and last four digits.

## Buyer purchases

- Cart APIs under `/api/store/cart` provide authenticated cart operations.
- `POST /api/store/checkout` initializes an NGN Paystack checkout and reserves stock. It returns 503 unless `STORE_CHECKOUT_ENABLED=true` and required payment configuration is present.
- `/api/store/orders`, `/api/store/orders/verify`, `/api/payment/webhook`, and `/api/admin/store/orders/[id]/refund` cover buyer order history/cancellation, server-side payment verification, signed provider webhook updates, and owner + verified-2FA full refunds.
- Checkout includes one seller-selected delivery option per seller. The 5% commission applies to item gross, not delivery fees. Paystack transfers start only after buyer-confirmed delivery and both `STORE_CHECKOUT_ENABLED` and `STORE_PAYOUTS_ENABLED` are true.

## Trust, safety, and communication

- Seller verification and Store notification routes are under `/api/store/seller/verification` and `/api/store/notifications`.
- Conversations, messages, block/report, and attachment handling are under `/api/store/conversations` and `/api/store/messages`.
- Disputes, reports, and appeals are under `/api/store/orders/disputes`, `/api/store/reports`, and `/api/store/reports/appeals`.
- `PUT /api/store/orders` confirms delivery receipt and triggers eligible seller payout processing.
- `/api/store/push` supports opt-in VAPID Web Push subscriptions; push delivery is disabled until VAPID configuration exists.
- Owner + verified-2FA administration endpoints live under `/api/admin/store`, including work queue, product/report review, seller verification, disputes, appeals, support, and data requests.

For exact validation rules and gaps, inspect the route implementation and the authoritative release status. API presence does not establish integration, RLS, or production readiness.
