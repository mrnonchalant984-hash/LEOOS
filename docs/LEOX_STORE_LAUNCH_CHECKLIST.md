# LeoX Store operator launch checklist

This is the operational companion to [the authoritative implementation status](../LEOX_STORE_RELEASE_GAPS.md). Repository implementation and migration-history evidence are not production approval.

## Confirm before any release activity

- [ ] Record the Supabase project reference, environment designation, operator, backup/recovery owner, and current migration history.
- [ ] Read-only CLI output shows local/remote migration versions in agreement through `20261111160000`. Verify target schema and RLS behavior independently; do not reapply migrations based on this summary.
- [ ] Confirm a recoverable backup and reviewed rollback/forward-fix procedure.
- [ ] Keep `STORE_CHECKOUT_ENABLED` unset or `false` until each payment and business gate is approved.

## Payments and commerce decisions

- [ ] Confirm Paystack marketplace/business approval, secret handling, callback/webhook URLs, signature validation, sandbox outcomes, and provider reconciliation ownership.
- [ ] Approve the 5% commission on item subtotal (delivery fee is passed through), merchant of record, seller payout/settlement, delivery fee collection, taxes, chargebacks, cancellation, refund, and late-payment handling.
- [ ] Confirm NGN-only checkout is appropriate for the first supported market.
- [ ] Test successful, failed, duplicate, expired-reservation, late, refunded, and webhook-retry paths in a confirmed non-production environment.

## Access, security, and user experience

- [ ] Exercise cross-account RLS for listings, seller data, carts/orders, fulfillment, conversations/attachments, disputes, appeals, notifications, and moderation.
- [ ] Test seller-facing order management and manual tracking entry; sellers arrange delivery, no courier API is connected.
- [ ] Decide image and private attachment scanning, retention and deletion workflow; verify image editing/removal and storage cleanup.
- [ ] Configure VAPID keys and test push opt-in, delivery, unsubscribe, stale endpoint cleanup, notification preferences, and email monitoring.
- [ ] Complete browser/mobile, accessibility, abuse/security, monitoring/alert, backup restore, and rollback checks.
- [ ] Approve legal terms, privacy, prohibited-item, verification, return, dispute, retention, and deletion policies with qualified reviewers.

## Production and rollback

- [ ] Capture fresh test, typecheck, lint, and production-build output plus environment-specific end-to-end evidence.
- [ ] Obtain written deployment and migration authorization. This reconciliation did not deploy or apply migrations.
- [ ] Enable both `STORE_CHECKOUT_ENABLED=true` and `STORE_PAYOUTS_ENABLED=true` only after all blockers are closed and an accountable operator approves.
- [ ] For an incident, pause checkout/writes, preserve order/payment evidence, and follow the approved recovery process. Do not drop marketplace data as a rollback shortcut.
