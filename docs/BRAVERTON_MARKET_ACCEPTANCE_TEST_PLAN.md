# Braverton Market — Launch Acceptance Test Plan

Branch: `braverton-market-launch-readiness`

This checklist defines the remaining verification work. A code-level test is not proof that an external provider, live email delivery, or production workflow is operational. Record evidence for every result. Use sandbox/test mode and synthetic accounts only; do not charge real customers or initiate real payouts during acceptance testing.

## 1. Paystack sandbox checkout, webhook, confirmation and reconciliation
- [ ] Confirm the correct Paystack test public/secret credentials are configured in the intended non-production environment without exposing values in logs or client bundles.
- [ ] Initialize a test NGN marketplace checkout and verify amount, currency, order reference and metadata.
- [ ] Verify successful, failed, abandoned, duplicate and delayed payment scenarios.
- [ ] Verify webhook signature validation and server-side transaction verification against the exact order reference, amount, currency and metadata.
- [ ] Verify idempotency: repeated webhook deliveries must not create duplicate paid orders, fulfilment events, commissions or notifications.
- [ ] Confirm an order becomes paid only after verified provider confirmation; browser redirects alone must never mark it paid.
- [ ] Reconcile provider test transactions against internal order/payment records, including mismatches, reversals and refunds where supported.
- [ ] Keep checkout and payouts disabled in production until separate release approval.

## 2. Web3Forms Access Key and actual email delivery
- [ ] Confirm the server-side helper uses the documented Access Key `POST /submit` contract and does not require a separate Form ID.
- [ ] Confirm the key is server-side only and is not returned to browsers, logs, or error messages.
- [ ] Verify Web3Forms account entitlement and any required deployment egress-IP allowlisting for server-side submissions.
- [ ] Send a clearly identified test message to an authorized test inbox and verify actual inbox delivery, not merely an HTTP success response.
- [ ] Verify failure handling, retries, idempotency and delivery-ledger status for accepted, rejected and timed-out submissions.
- [ ] Confirm recipient auto-replies are not assumed unless the account plan supports them.
- [ ] Keep email marked unverified until a recipient confirms receipt.

## 3. Braverton brand and seller-facing workflows
- [ ] Review public marketplace landing page, category navigation, product cards, seller storefront and responsive layouts.
- [ ] Verify Braverton naming, logos/assets, typography, colors, metadata and consistent wording.
- [ ] Verify seller onboarding, profile editing, contact details, delivery information and validation.
- [ ] Confirm only verified sellers' intended public contact details appear; private authentication/contact data must not leak.
- [ ] Verify seller product creation, editing, moderation status, order views and fulfilment updates.
- [ ] Check empty, loading, error and mobile states; remove dead controls or misleading success messages.

## 4. Affiliate registration, attribution, commissions and listings
- [ ] Test eligible and ineligible affiliate registration, email confirmation and approval states.
- [ ] Verify referral link generation, click attribution, cookie/session handling and self-referral/duplicate protections.
- [ ] Verify attribution survives the supported buyer journey without allowing client-supplied affiliate IDs to override trusted attribution.
- [ ] Test commission calculations, rounding, order cancellation, refund, partial fulfilment and dispute cases.
- [ ] Confirm commissions remain unavailable until all fulfilments are delivered and buyer-confirmed, no dispute is open, affiliate status is approved, and the configured dispute window has elapsed.
- [ ] Verify commission release is idempotent and auditable.
- [ ] Verify affiliate listing/dashboard displays accurate clicks, conversions, pending/eligible/reversed commissions and status explanations.
- [ ] Keep payout actions disabled pending separate approval and compliant settlement arrangements.

## 5. Dropshipping supplier applications, verification and listing moderation
- [ ] Test supplier application submission, required terms acceptance and validation.
- [ ] Test supplier verification approval, rejection and pending/manual-review paths.
- [ ] Verify only eligible verified suppliers and sellers can proceed.
- [ ] Test stock availability, price/commission data, application status history and notifications.
- [ ] Confirm supplier approval creates a paused/pending-moderation reseller listing rather than publishing immediately.
- [ ] Verify normal product moderation, supplier status and stock availability control whether a listing can become active.
- [ ] Test rejection, stock-out, supplier suspension and listing pause/unpublish paths.
- [ ] Verify supplier fulfilment responsibilities and buyer-facing messaging are clear.

## 6. Bram seller-verification execution and human review
- [ ] Test the cron-protected worker with the feature flag disabled and enabled in an isolated test environment.
- [ ] Verify it claims only eligible queued applications and records durable outcomes without processing the same application twice.
- [ ] Test confirmed email, account age, business context, duplicate-name, external-link and prohibited-term signals.
- [ ] Verify low-risk auto-approval is limited to the documented criteria.
- [ ] Verify evidence links and ambiguous/high-risk applications are escalated to human review, not blindly approved or rejected.
- [ ] Verify owner review requires the configured owner authorization, trusted-device and two-factor checks.
- [ ] Confirm every automated and human decision records actor/source, outcome, rationale, risk signals and engine version.
- [ ] Verify worker retries, partial failures, rate limits and operational logs.

## 7. End-to-end acceptance and regression
- [ ] Run lint, unit/integration tests, TypeScript typecheck and production build on the readiness branch.
- [ ] Run isolated end-to-end scenarios: seller onboarding → verification → product moderation → affiliate attribution → sandbox checkout → verified webhook → order tracking → seller/supplier fulfilment → buyer confirmation → commission eligibility.
- [ ] Verify notification delivery records and actual email results for each supported event.
- [ ] Verify access control and RLS for buyer, seller, supplier, affiliate and owner roles; test cross-account access denial.
- [ ] Verify duplicate requests, retries, stale jobs, worker overlap, provider timeouts and recovery paths.
- [ ] Record failing test names, root causes, fixes and rerun results.
- [ ] Do not call the marketplace launch-ready while any critical acceptance item is unverified or failed.

## 8. Escrow and funds custody — separate legal/provider gate
- [ ] Do not describe Paystack split settlement, an internal ledger, delayed payout, or a database status as escrow.
- [ ] Obtain written confirmation from a properly authorized Nigerian bank/financial institution that it offers a marketplace-appropriate escrow or safeguarded hold-and-release arrangement for this business model.
- [ ] Have an adult business owner and qualified Nigerian legal/compliance adviser confirm the provider's regulatory authority, account structure, custody of funds, release conditions, disputes, refunds, insolvency treatment, fees and customer disclosures.
- [ ] Implement only the provider-approved integration and test it in sandbox before any real-money use.
- [ ] No Braverton-controlled customer-funds custody, real-money hold/release, checkout or payouts until this gate is cleared and separately approved.

## Release controls
- No production deployment, merge to `main`, real customer charge, payout, or escrow activation is authorized by this checklist.
- Backups and staging restore remain deferred as separately agreed.
- Record test environment, commit SHA, timestamps, evidence and reviewer for every completed item.
