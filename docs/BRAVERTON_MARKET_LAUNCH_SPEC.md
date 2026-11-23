# Braverton Market — launch implementation specification

Status: working requirements and acceptance gates on branch `braverton-market-launch-readiness`.
This document is not evidence that a feature is implemented, tested, or production-ready. Do not merge or deploy until the owner reviews the branch and the acceptance evidence.

## Owner-confirmed baseline (do not reopen without contrary evidence)
- Supabase marketplace migrations are planned/applied and running, per owner confirmation. Verify schema compatibility read-only when implementing; do not reapply existing migrations.
- Platform security has been reviewed and accepted by the owner. Preserve current controls; do not weaken them. Run targeted regression tests for new workflows.
- Paystack is configured and payment webhooks have been verified, per owner confirmation.
- Mobile browsing compatibility has passed, per owner confirmation.
- Messaging is working, per owner confirmation.
- Actual seller payout/settlement has NOT been proven by a completed live transaction. Do not mark settlement verified until a controlled end-to-end test is completed and reconciled.

## Product and storefront
1. Brand all user-facing store names as **Braverton Market** and all seller storefront labels as **Braverton Market Storefront**. Remove stale "LeoX Store", "LeoX Market", and "LeoX storefront" copy from store UI, emails, metadata, notifications, and help text. Internal route names/table names may remain for backward compatibility.
2. The marketplace landing page defaults to all active products from verified sellers. No department selection is required to see general products.
3. Department selection filters the same product catalogue by the selected database category. Clearing the filter restores all active products. Search and category filters must compose correctly.
4. Seller storefront profile should support store name, description, logo, WhatsApp contact number, other approved contact details, location, delivery details, ratings, verification state, and active product catalogue. WhatsApp must be explicitly seller-provided and validated; never infer or expose private account phone data.
5. Listing creation remains free and unlimited at the product-policy level. Retain abuse controls, file-size limits, moderation, rate limits, and infrastructure protections; do not introduce a listing fee or arbitrary paid listing cap.

## Seller onboarding and Bram
1. On application submission, place the application in a durable review queue visible to Bram with submitted profile data and evidence.
2. Bram performs documented checks against the configured policy: required fields, consistency, duplicate/suspicious signals, storefront completeness, policy compliance, and evidence presence. Log the checks, evidence references, decision, rationale, model/policy version, and timestamp.
3. Bram may automatically approve only low-risk applications that pass every deterministic required check and policy threshold. Reject only when a clear policy failure is established; otherwise escalate to the owner/admin. No approval based solely on application submission or a phone call.
4. Do not introduce mandatory phone OTP or identity-document collection by default. Ask only for proportionate information needed to establish seller legitimacy. Never claim formal identity/KYC verification unless a compliant provider and workflow exist.
5. Preserve owner override, audit trail, appeal/re-review, and least-privilege service access. Bram must not grant itself admin permissions or bypass existing controls.
6. Once approved, save/activate the storefront profile and unlock product listing. Sellers can manage their profile and listings themselves after approval.

## Orders, delivery, and notifications
1. Generate a unique, non-guessable, human-readable Braverton order reference, e.g. `BRV-2026-000001`. Enforce uniqueness in the database and do not expose sequential IDs that allow enumeration. Use the reference consistently in buyer/seller views, receipts, support, and notifications.
2. Keep Braverton as marketplace facilitator only: the supplier/seller and their chosen delivery provider remain responsible for supplying and delivering goods. Do not imply Braverton is the supplier or courier.
3. Preserve seller-entered courier/tracking information. Support order status timeline and buyer-visible reference lookup only after proper authorization; a reference alone must not reveal private order details.
4. Verify event coverage and delivery for in-app, email, and opt-in push notifications: order placed, payment confirmed, seller accepted, dispatched, delivery completed, cancellation/refund, new message, seller verification outcome, affiliate commission/withdrawal events. Respect notification preferences and avoid duplicate sends with idempotency.
5. Configure notification providers/keys only after verifying secrets and consent. Record delivery outcomes; do not display "sent" when delivery is unconfirmed.

## Affiliate and dropshipping
1. Test affiliate registration, unique referral attribution, click/order attribution, self-referral/fraud prevention, commission ledger, eligibility rules, dashboard, and withdrawal request lifecycle. Do not claim automated payouts unless provider transfer and reconciliation are implemented and tested.
2. Dropshipping is a supplier-to-reseller relationship. Support application/request, supplier approval/rejection, product terms, stock/availability, agreed pricing, status history, and a unique relationship/application reference. Supplier fulfills the reseller's order through their chosen delivery provider. Braverton records the relationship but is not supplier or courier.
3. Keep buyer payment, seller settlement, supplier payment, and affiliate commission ledgers distinct. No funds custody or transfer should be implied where it is not implemented and approved.

## Buyer accounts and payments
- Regression-test registration/login, buyer profile, cart, checkout, order history, messaging, notifications, reviews, disputes, and account isolation.
- Paystack setup and webhook verification are owner-confirmed. Separately test a controlled payment through webhook, order state, seller ledger, refund/cancellation paths, and reconciliation.
- Seller settlement is unverified until an actual controlled transaction and payout/reconciliation test is completed. Keep any payout feature gate closed until approved.

## Backup, monitoring, and recovery
- Determine the active Supabase plan and backup/PITR capability. Configure automated backups or documented exports appropriate to the plan, retention, access restrictions, and alerting.
- Include database and relevant object-storage recovery considerations. Backups must be encrypted, access-controlled, and stored separately from production credentials.
- Perform and document a restore drill into a non-production environment. A backup is not accepted merely because a backup job reports success.
- Add production error/availability monitoring, alert routing, webhook/queue failure visibility, and a written incident/rollback runbook.

## Acceptance gates — do not merge until all are evidenced
- [ ] All stale LeoX Store public-facing branding replaced; no internal database/API identifiers changed without compatibility plan.
- [ ] Default all-products discovery and category-specific filtering verified against real database data.
- [ ] Seller storefront fields, including seller-entered WhatsApp number, saved and rendered correctly with privacy controls.
- [ ] Unlimited free product listing policy retained with abuse/security safeguards.
- [ ] Bram checks, risk-based approval, escalation, audit log, and owner override tested; no blind approvals.
- [ ] Unique order reference generated and shown across buyer/seller flows; no reference-only data disclosure.
- [ ] Notification event matrix tested end-to-end with delivery evidence and deduplication.
- [ ] Affiliate flow tested through eligible commission and withdrawal status.
- [ ] Dropshipping request/approval/reference lifecycle tested; supplier and courier responsibilities clearly separated from Braverton.
- [ ] Buyer account regression suite passes.
- [ ] Controlled Paystack payment and seller settlement test reconciled; no test funds or transfers left unresolved.
- [ ] Automated backups configured and a restore drill passes.
- [ ] Monitoring, alerts, and rollback runbook verified.
- [ ] Typecheck, lint, unit/integration tests, production build, and relevant CI pass.
- [ ] Owner reviews the completed evidence and explicitly authorizes merge. No production deployment before separate approval.

## Implementation constraints
- Extend the existing marketplace; do not rebuild or replace it.
- Preserve existing migrations and working features. Prefer additive, backward-compatible changes.
- Do not run production migrations, change production secrets, enable checkout/payout gates, merge, or deploy without separate explicit authorization.
- Update the release-gap report with observed evidence; never mark a requirement complete based only on source code existing.
