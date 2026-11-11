# LeoX Store launch checklist

## Implemented in this worktree

- [x] Repository and app architecture inspected; existing App Router, auth, Supabase, and visual design reused.
- [x] Public listing discovery and active product details added.
- [x] Authenticated submissions validated and held for moderation.
- [x] Additive database migration and Store SEO metadata/sitemap support added.
- [x] Buyer cart, NGN Paystack checkout, payment verification/webhook, order cancellation requests, owner-reviewed refunds, and printable receipts added locally.
- [x] Seller storefront profiles, listing edits, inventory management, delivery options, and paid-sales dashboard added locally.
- [x] Listing validation unit tests, typecheck, and targeted lint pass.

## Release gates still open

- [ ] Repair the two NUL-filled tracked test files and resolve the existing sandbox contract test failure.
- [x] Apply buying and seller tools migrations to linked Supabase project `xqyrbdsdojbxgqgghucf`; confirm migration history, table RLS, access policies, and existing rate-limit schema.
- [ ] Confirm the linked project's staging or production designation in deployment settings before routing live buyers.
- [ ] Configure Paystack webhook and secret in staging; test success, failure, refund, duplicate, expired-reservation, and late-payment paths.
- [ ] Decide merchant-of-record, commission, seller payout/split settlement, delivery fee, tax, and refund operations before accepting live orders.
- [ ] Implement seller order fulfillment and delivery updates, seller cancellation response, and refund reconciliation UI.
- [ ] Finish moderator report review, appeals, seller verification workflows, and order administration UI.
- [ ] Implement seller fulfillment/order status updates, buyer delivery selection and fee collection, and notification delivery.
- [ ] Complete full African country/currency data and safe location/category filters.
- [ ] Verify constraints, RLS, and limiter RPC against the applied staging schema.
- [ ] Pass full lint, full test suite, production build, API/security/RLS and browser/mobile tests.
- [ ] Verify staging configuration, backups, monitoring, and rollout/rollback.
- [ ] Obtain explicit authorization before production migration or deployment.
