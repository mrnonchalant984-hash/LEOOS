# LeoX Store operations runbook

## Migration release

1. Confirm the target project's ref and label it staging in the release record.
2. Confirm database backup completion and restore access.
3. Apply pending migrations in order using the project's approved Supabase deployment process.
4. Verify the migration history, RLS enabled state, grants, policies, and expected indexes. Run cross-user access tests before deploying application code.
5. Deploy the matching application revision to staging and test with separate buyer, seller, and owner accounts.

## Buyer and seller account operations

- Store signup records the user's chosen buyer or seller landing preference. The choice is not an authorization grant.
- Seller applicants submit storefront name, country, and business context from the seller dashboard. Staff reviews the request in the owner work queue; identity documents are not collected.
- Listing creation and management, image uploads, public seller pages, and checkout require `marketplace_sellers.is_verified = true`. After approval, confirm the seller profile is provisioned and can open the seller tools before closing the review.
- Buyers use `/store/account` for orders, messages, and cart links. Sellers use `/store/seller` for verification, storefront setup, inventory, and delivery settings.

## Operational decisions

- Checkout stays disabled unless `STORE_CHECKOUT_ENABLED=true`. Set it only after the Paystack environment, callback/webhook URLs, settlement, refund handling, seller payouts, currency, delivery charges and tax rules have written approval.
- Current fulfillment is seller-managed status and optional tracking metadata. It does not quote shipping, dispatch couriers, or verify delivery scans.
- Email notifications require `RESEND_API_KEY` and `CONTACT_FROM_EMAIL`; verify sender domain and delivery monitoring before enabling. Push delivery is not connected.
- Seller verification requests are staff-reviewed declarations, not identity verification. Do not ask users to upload identity documents until an approved secure verification provider and retention terms are selected.
- Data deletion is a reviewed request. Preserve financial, dispute and safety records only for a documented legal/business retention period.

## Incident and rollback

On payment or data-access incident, pause checkout and relevant writes, preserve logs and webhook evidence, notify the named incident owner, and use the approved restore procedure. Never delete payment/order evidence as a schema rollback shortcut. After recovery, reconcile payment-provider transactions, webhook states and order fulfillment status.

## Monitoring to configure

Alert on elevated checkout failures, webhook verification failures or backlog, database/API 5xx rates, storage authorization failures, unhandled refunds, stale paid orders, delivery issues, growing report/dispute queues, support response delays, and backup/restore failures. Assign an on-call owner and test each alert before launch.
