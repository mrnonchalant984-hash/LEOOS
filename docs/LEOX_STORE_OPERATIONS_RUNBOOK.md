# LeoX Store operations runbook

## Migration release

1. Confirm the target project's ref and environment with the database owner; do not infer staging/production from a linked CLI project.
2. Confirm database backup completion and restore access.
3. Review the migration diff/history and obtain separate authorization before applying a migration. This reconciliation made no database changes.
4. Read-only migration-history output showed local and remote versions agree through `20261111160000`. Verify catalog/RLS state and run cross-account access tests independently.
5. Deploy the matching application revision to an authorized non-production environment and test with separate buyer, seller, and owner accounts.

## Buyer and seller account operations

- Store signup records the user's chosen buyer or seller landing preference. The choice is not an authorization grant.
- Seller applicants submit storefront name, country, and business context from the seller dashboard. Staff reviews the request in the owner work queue; identity documents are not collected.
- Listing creation and management, image uploads, public seller pages, and checkout require `marketplace_sellers.is_verified = true`. After approval, confirm the seller profile is provisioned and can open the seller tools before closing the review.
- Buyers use `/store/account` for orders, messages, and cart links. Sellers use `/store/seller` for verification, storefront setup, inventory, and delivery settings.

## Operational decisions

- Checkout and automatic transfers remain disabled unless both `STORE_CHECKOUT_ENABLED=true` and `STORE_PAYOUTS_ENABLED=true`. Set only after Paystack marketplace/transfer approval, callback/webhook URLs, settlement, refund handling, seller payouts, commission, currency, delivery charges and tax rules have written approval.
- Sellers arrange their own delivery, manage order status, and enter courier/tracking details in `/store/seller/orders`; no courier booking API or delivery scan is connected. Buyer-confirmed receipt is required before the 5%-commission-adjusted seller transfer.
- Some Store events create in-app notifications and may send email. VAPID Web Push code is opt-in and requires `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`; configure and test each before enabling.
- Seller verification requests are staff-reviewed declarations, not identity verification. Do not ask users to upload identity documents until an approved secure verification provider and retention terms are selected.
- Data deletion is a reviewed request. Preserve financial, dispute and safety records only for a documented legal/business retention period.

## Incident and rollback

On payment or data-access incident, pause checkout and relevant writes, preserve logs and webhook evidence, notify the named incident owner, and use the approved restore procedure. Never delete payment/order evidence as a schema rollback shortcut. After recovery, reconcile provider transactions, webhook states, refunds and fulfillment status.

## Monitoring to configure

Alert on elevated checkout failures, webhook verification failures or backlog, database/API 5xx rates, storage authorization failures, unhandled refunds, stale paid orders, delivery issues, growing report/dispute queues, support response delays, and backup/restore failures. Assign an on-call owner and test each alert before launch.
