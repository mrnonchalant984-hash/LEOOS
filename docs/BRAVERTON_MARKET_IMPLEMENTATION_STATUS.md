# Braverton Market implementation status

Branch: `braverton-market-launch-readiness`

This report separates code added to the branch from live services and acceptance checks. Code presence is not proof of successful production operation.

## Implemented on this branch

### Storefront and seller access
- Rebranded public marketplace pages, seller workspace and storefronts to Braverton Market.
- The landing page shows active products by default; department options are loaded from active database categories, and selecting a department filters by the stored category.
- Added seller-entered WhatsApp, public email, location and delivery details with validation and a seller dashboard form.
- Public storefront displays only seller-supplied contact details for verified sellers; it never copies private authentication phone data.
- Delivery messaging clearly states that the seller or chosen provider handles delivery.
- Product creation retains no lifetime listing cap; existing abuse/rate controls remain.

### Bram seller verification
- Added optional public evidence URL and notes. Evidence links are HTTPS-only and force human review; private identity documents and sensitive records are not requested.
- Added a deterministic, versioned Bram risk engine. Only applications with confirmed account email, at least seven days of account history, sufficiently complete business context, no exact-name duplicate, no external-link risk and no prohibited-term flag can be auto-approved.
- Higher-risk or incomplete applications remain pending and are escalated; the worker does not blindly reject.
- Added decision audit records with risk score, signals, rationale and engine version.
- Added a CRON_SECRET-protected, feature-gated worker and an owner review queue/API. Owner decisions require the platform-owner guard, trusted device and verified two-factor authentication; decisions are auditable.
- Seller approval is marketplace access approval, not government identity or business-registration certification.

### Orders and tracking
- Added random 80-bit-suffix `BRV-YYYY-...` human-readable order references to prevent easy enumeration, while retaining the unique database constraint.
- Added database timeline events when seller/supplier fulfilment changes or the buyer confirms receipt.
- Buyer and seller order APIs return their authorized event history; buyer and seller UIs render tracking timelines.
- Tracking APIs expose only event type and timestamp, not internal event payloads. A reference alone does not grant order access.
- Buyer checkout requires a confirmed account email.

### Notifications
- Added deduplicated notification keys and a private delivery ledger for in-app, email and per-device push outcomes.
- Delivery records distinguish sent, failed and skipped; email opt-out and notification preferences are respected.
- Added retries for failed/pending notification deliveries and an owner-only delivery evidence dashboard.
- Added event notifications for paid orders, payment failure, buyer cancellation requests, seller fulfilment updates, supplier fulfilment updates, refunds, new messages, seller verification, dropship applications, affiliate commissions and affiliate payout requests/decisions/transfers.
- Marketplace transactional email now uses the documented Web3Forms `POST /submit` Access Key endpoint; no separate Form ID is required (the Access Key and optional Form ID are the same value). The app accepts `WEB3FORMS_ACCESS_KEY` or the existing `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`. Web3Forms documents server-side submissions as requiring an active paid plan and deployment egress-IP allowlisting; recipient auto-replies require its PRO autoresponder feature. Until those account settings are confirmed and a real recipient test succeeds, transactional email remains unverified. Browser push remains Web Push/VAPID, not an email provider. Provider acceptance is not proof of inbox/device delivery.

### Affiliate and dropshipping
- Existing affiliate attribution and commission logic is retained. Commission eligibility remains gated on all fulfilments being delivered and buyer-confirmed, no open dispute, approved affiliate status and the seven-day dispute window.
- Added a scheduled worker for affiliate commission release and eligibility notifications.
- Affiliate payout requests, owner review decisions and transfer/reconciliation outcomes now notify affiliates. Existing payout feature gates remain unchanged.
- Added an approved-supplier catalogue for verified resellers, explicit seller terms acceptance, supplier terms acceptance, application records and supplier accept/reject controls.
- Supplier approval validates both parties and supplier stock, creates a paused reseller listing, and leaves it pending normal Braverton product moderation. Listing status follows marketplace moderation, supplier verification and stock availability.
- Added immutable application/listing status history for seller and supplier views.
- Supplier-side fulfilment remains the supplier's responsibility; Braverton is not represented as the supplier or courier.

### Backups and recovery
- Added a daily GitHub Actions workflow for database dump + configured Supabase Storage bucket export, age encryption, off-site S3-compatible upload, checksum verification and retention configuration.
- Added a staging-only restore script and restore runbook.
- Live Supabase organization was inspected: it is on the Free plan. Supabase states Free projects do not receive automatic daily backups and recommends regular exports plus off-site backups; Pro, Team and Enterprise include managed daily backups. Database backups do not include Storage objects, which is why the workflow exports the marketplace buckets separately.
- The backup workflow intentionally reports a skipped run when required secrets/variables are missing. A skipped run is not a backup.

### Scheduled marketplace operations
- Added a GitHub Actions scheduled workflow for notification retries and affiliate commission release, with Bram review behind an explicit feature flag.
- Preserved the existing Vercel cron schedule unchanged.

## Existing foundations retained
- Marketplace product moderation and listings.
- Buyer cart, checkout, Paystack verification/webhook and order history.
- Seller delivery options, payout accounts and settlement ledgers.
- Affiliate applications, attribution, commissions and payout requests.
- Supplier verification, supplier catalogue and supplier fulfilment dispatch foundations.
- Buyer/seller messaging and push subscription management.

## Not yet operationally verified

1. Both Braverton migrations have been applied to the connected Supabase production project and verified in migration history: `20261123213923` (`braverton_seller_storefront_contacts`) and `20261123214045` (`braverton_market_launch_hardening`). Matching application code remains isolated on this branch.
2. The scheduled marketplace-operations workflow passed its readiness-branch configuration check. The GitHub Actions `CRON_SECRET` is present. The readiness-branch run intentionally skipped all production API calls; no Bram seller-verification job was executed. Existing Supabase cron jobs for Bram productivity and the workflow worker are inactive and have no recorded runs.
3. The backup workflow's configuration-only check completed, but it found all required backup settings missing: `SUPABASE_DB_URL`, `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`, `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY`, `SUPABASE_STORAGE_BUCKETS`, `BACKUP_AGE_RECIPIENT`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, and `BACKUP_S3_SECRET_ACCESS_KEY`. No backup was created or uploaded. The script now downloads the uploaded encrypted object and verifies its actual bytes, and it preserves unrelated bucket lifecycle rules.
4. A staging restore drill remains outstanding. No isolated staging database and Storage credentials were available, so no restore or synthetic marketplace transaction was run against production.
5. Latest GitHub CI run on this branch (`45276527595`) passed: `npm run verify` (lint, tests and build), TypeScript typecheck, a separate production bundle build, and backup/restore shell syntax validation.
6. Web3Forms integration has been aligned to its documented `POST /submit` Access Key contract; it no longer incorrectly requires a separate Form ID or the Submissions API response shape. The helper recognizes `WEB3FORMS_ACCESS_KEY` and the existing `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`. Web3Forms states server-side API calls require an active paid subscription and the deployment egress IP on its safelist; buyer/seller recipient copies additionally require the PRO autoresponder feature. These account entitlements/IP allowlisting and a real inbox delivery test are not verified, so email remains operationally blocked pending that proof. Push delivery remains a separate VAPID/Web Push path.
7. Paystack dynamic split payload now includes the required order name and NGN currency fields. Tests cover checkout feature gates and webhook verification of transaction reference, metadata, amount and currency. No usable Paystack test key was confirmed, so no sandbox payment or transfer was run; no live transaction or payout was initiated. Paystack split settlement is not escrow.
8. Affiliate attribution/commission, payout-request gating, supplier application, supplier approval, moderated listing and notification behavior have code-level regression coverage. Full staging end-to-end buyer/seller/affiliate/supplier acceptance tests remain outstanding because there is no isolated staging environment and no test Paystack/Web3Forms credentials.
9. Escrow is **not ready**. There is no verified custodial arrangement or complete funds-hold, dispute, refund, release and reconciliation system. Do not enable split settlement, checkout or payouts until that design is implemented and independently validated.
10. Supabase advisors still report project-wide security/performance warnings, including mutable function search paths, public execution of some security-definer functions, auth RLS initialization-plan warnings and unindexed marketplace foreign keys. These require a separate scoped review; the new Braverton private ledger tables have RLS enabled with no client policies (default deny).

## Release boundary
- The two Braverton migrations were applied to the connected Supabase production database on 2026-11-23 and verified in migration history. This was a database-only change; matching application code remains isolated on this branch and has not been deployed.
- Production feature gates `STORE_CHECKOUT_ENABLED` and `STORE_PAYOUTS_ENABLED` were set to `false`; those values are not active in the currently serving deployment until a new production deployment is authorized and completed. No payment credentials were read or changed.
- No payment or payout was initiated.
- No Git merge or Vercel production deployment was performed.
- Keep the branch isolated until staging evidence is reviewed and the owner explicitly approves the next release step.
