# Braverton Market implementation status

Branch: `braverton-market-launch-readiness`

This report distinguishes code added to the branch from live services and acceptance checks. Code presence is not proof of successful production operation.

## Implemented on this branch

### Storefront and seller access
- Rebranded the marketplace landing page, seller workspace and public storefront to Braverton Market.
- Added seller-entered WhatsApp, public email, location and delivery details with validation and a seller dashboard form.
- Public storefront shows only seller-entered contact details for verified sellers; it never copies private authentication phone data.
- Delivery messaging clearly says the seller or their chosen provider handles delivery.

### Bram seller verification
- Added a deterministic, versioned Bram risk engine. Only applications with confirmed account email, at least seven days of account history, sufficiently complete business context, no exact-name duplicate and no external-link risk are auto-approved.
- Higher-risk or incomplete applications remain pending and are escalated; the worker does not blindly reject.
- Added decision audit records with risk score, signals, rationale and engine version.
- Added a CRON_SECRET-protected, feature-gated worker and daily Vercel cron entry.
- Added owner review queue/API. The SQL decision function requires owner role and verified two-factor authentication, records owner decisions, and activates or rejects the seller profile.
- Seller approval is marketplace access approval, not government identity or business-registration certification.

### Orders and tracking
- Added a sequence-backed BRV-YYYY-000001 human-readable order number trigger while retaining the unique database constraint.
- Added database timeline events when seller/supplier fulfilment changes or the buyer confirms receipt.
- Buyer and seller order APIs return their authorized order-event history; buyer UI renders the tracking timeline.
- Existing order access remains scoped to the authenticated buyer or seller. A reference alone does not grant order access.

### Notifications
- Added deduplicated notification keys and a private delivery ledger for in-app, email and per-device push outcomes.
- Delivery records distinguish sent, failed and skipped; email opt-out and notification preferences are respected.
- Added event notifications for paid orders, payment failure, buyer cancellation requests, seller fulfilment updates, supplier fulfilment updates, refunds, seller verification, affiliate commissions and affiliate payouts.
- Delivery is recorded; successful provider delivery still requires live credentials and real staging tests.

### Affiliate and dropshipping
- Existing affiliate attribution and commission logic is retained. Commission eligibility remains gated on all fulfilments being delivered and buyer-confirmed, no open dispute, approved affiliate status and the seven-day dispute window.
- Added regression coverage for affiliate self-referral exclusion and buyer-confirmed commission eligibility.
- Added a supplier catalogue for verified resellers, explicit terms acceptance, reseller application records and supplier review controls.
- Supplier approval transaction verifies both parties and current supplier stock, creates a paused reseller listing and leaves it pending normal Braverton product moderation.
- Supplier-side fulfilment remains the supplier's responsibility; Braverton is not represented as the courier.

### Backups and recovery
- Added daily GitHub Actions workflow, database dump + configured Supabase Storage bucket export, age encryption, off-site S3-compatible upload, retention configuration, staging-only restore script and runbook.
- Live Supabase organization was inspected: it is on the Free plan. Supabase documentation says Free projects should export their data and keep off-site backups; managed daily backups are included on Pro, Team and Enterprise plans.
- The backup workflow intentionally reports a skipped run when required secrets/variables are missing. A skipped run is not a backup.

## Existing foundations retained
- Marketplace product listings and moderation.
- Buyer cart, checkout, Paystack verification/webhook and order history.
- Seller delivery options, payout accounts and settlement ledgers.
- Affiliate applications, attribution, commissions and payout requests.
- Supplier verification, supplier catalogue and supplier fulfilment dispatch foundations.
- Buyer/seller messaging and push subscription management.

## Not yet operationally verified
1. The new Braverton migrations are branch-only. They have **not** been applied to the connected Supabase production project.
2. Configure `BRAM_STORE_VERIFICATION_ENABLED=true` and verify the daily cron executes successfully after the migration is applied in an authorized staging environment.
3. Configure the GitHub backup secrets/variables and independent off-site bucket. Run the first encrypted backup and verify its checksum/retention policy.
4. Run a staging restore drill using `scripts/braverton-restore-staging.sh`; record restored row counts, Storage object counts, elapsed time and app smoke-test results.
5. Run the full lint, test, typecheck and production build. The branch CI workflow has been configured to trigger on this branch, but no run result has yet been observed.
6. Exercise notification email and push delivery with real provider configuration; confirm delivery logs, preference handling, opt-outs and retries.
7. Complete staging end-to-end buyer/seller/affiliate/supplier tests, including seller verification escalation and owner override, referral attribution, disputes, affiliate payout request approval, supplier application approval/rejection, supplier dispatch and tracking.
8. Perform a controlled Paystack marketplace payment and settlement reconciliation before enabling checkout/payout feature gates. No actual transaction or payout has been initiated by this work.

## Release boundary
- No production migration was run.
- No production secrets or feature gates were changed.
- No payment or payout was initiated.
- No merge or production deployment was performed.
- Keep the branch isolated until staging evidence is reviewed and the owner explicitly approves the next release step.
