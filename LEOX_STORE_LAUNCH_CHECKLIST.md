# LeoX Store release checklist

The current implementation and production status are maintained in [LEOX_STORE_RELEASE_GAPS.md](./LEOX_STORE_RELEASE_GAPS.md). This checklist supersedes older checkboxes and must not be read as a deployment approval.

## Code present

- [x] Buyer and seller workspaces, listing discovery/detail, seller storefront, listing moderation, and seller verification workflow.
- [x] Cart, NGN Paystack initialization, server-side verification/webhook, buyer order history, cancellation requests, and owner-reviewed refund code.
- [x] Seller inventory, buyer-selected delivery fees, seller order UI/manual tracking, payout recipient/ledger code with 5% commission and buyer-confirmed Paystack transfer flow.
- [x] Listing image edit/removal and 2 MB input / 700 KB optimized WebP limits; opt-in VAPID push code.
- [x] Checkout/payouts fail closed unless `STORE_CHECKOUT_ENABLED=true` and `STORE_PAYOUTS_ENABLED=true`.

## Still required before live checkout

- [ ] Confirm target Supabase environment and migration/schema state. Read-only history matches local through `20261111160000`; the new `20261112100000` migration is not applied. This does not verify live RLS behavior or authorize a migration.
- [ ] Run cross-account RLS, security, abuse, and payment sandbox tests.
- [ ] Obtain Paystack marketplace/transfer approval and approve merchant of record, 5% item commission, seller payouts/settlement, chargeback/refund operations, delivery fee flow, and tax.
- [ ] Complete payout sandbox, transfer failure/reversal, buyer delivery confirmation, webhook, and reconciliation tests.
- [ ] Decide attachment/product image scanning and retention controls.
- [ ] Configure VAPID keys and complete browser push subscription/delivery/unsubscribe tests; assign notification incident/support ownership.
- [ ] Approve legal policies, retention and deletion service levels, and seller verification evidence model.
- [ ] Confirm backups, recovery drill, monitoring, accessibility, browser/mobile coverage, and rollback procedure.
- [ ] Record passing tests/typecheck/lint/build and environment-specific end-to-end evidence.
- [ ] Enable both `STORE_CHECKOUT_ENABLED=true` and `STORE_PAYOUTS_ENABLED=true` only after written approval in the intended environment.

No production deployment or migration was performed for this reconciliation. See [docs/LEOX_STORE_LAUNCH_CHECKLIST.md](./docs/LEOX_STORE_LAUNCH_CHECKLIST.md) for the operator checklist.
