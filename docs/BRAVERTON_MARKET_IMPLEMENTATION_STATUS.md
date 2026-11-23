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
- Provider acceptance is recorded as sent; actual inbox/device delivery still requires live provider configuration and staging tests.

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
1. The new Braverton migrations are branch-only. They have **not** been applied to the connected Supabase production project.
2. After the branch is approved and deployed, add the same `CRON_SECRET` as a GitHub Actions secret. Set repository variable `BRAVERTON_CRON_BASE_URL` if the production URL differs. Enable Bram only by setting both the Vercel environment variable and GitHub repository variable `BRAM_STORE_VERIFICATION_ENABLED=true`.
3. Configure the backup workflow secrets/variables and an independent off-site bucket. Run the first encrypted backup and verify its checksum and retention policy.
4. Run a staging restore drill using `scripts/braverton-restore-staging.sh`; record restored row counts, Storage object counts, elapsed time and app smoke-test results.
5. CI has been configured to run on this branch. The last observed CI run failed one pre-existing cron-schedule assertion because the Vercel schedule had been expanded; that schedule has now been restored to its original six entries and the workflow has been moved to GitHub Actions. A fresh CI run is required on the latest commit.
6. Exercise notification email and push delivery with real provider configuration; confirm provider acceptance, preference handling, opt-outs, retries and failure alerts.
7. Complete staging end-to-end buyer/seller/affiliate/supplier tests, including seller verification escalation and owner override, referral attribution, disputes, affiliate payout request approval, supplier application approval/rejection, supplier dispatch and tracking.
8. Perform a controlled Paystack marketplace payment and settlement reconciliation before enabling checkout/payout feature gates. No actual transaction or payout has been initiated by this work.

## Release boundary
- No production migration was run.
- No production secrets or feature gates were changed.
- No payment or payout was initiated.
- No merge or production deployment was performed.
- Keep the branch isolated until staging evidence is reviewed and the owner explicitly approves the next release step.
