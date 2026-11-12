# LeoX Store implementation and release status

This is the authoritative implementation-status document for every `LEOX_STORE_*.md` file at the repository root and under `docs/`. It compares repository code and migration files with the recorded remote Supabase migration history. It does not assert that production has been deployed or that live RLS behavior has been tested.

## Status definitions

- **IMPLEMENTED** — source code provides the described capability.
- **PARTIALLY IMPLEMENTED** — some code exists, but an important user-facing, operational, or business part is missing.
- **NOT IMPLEMENTED** — no complete implementation was found.
- **TESTED** — a listed automated check ran successfully; this does not imply integration or production testing.
- **NOT TESTED** — no adequate evidence from an executed test.
- **PRODUCTION BLOCKED** — keep the capability disabled until its stated configuration, operations, legal, or security gates are approved.

## Journey reconciliation

### Seller

| Journey step | Status | Evidence and limitation |
|---|---|---|
| Registration and role selection | PARTIALLY IMPLEMENTED | Signup records a buyer/seller destination preference; it is not an authorization role. |
| Verification | PARTIALLY IMPLEMENTED | Seller-submitted business/storefront declaration and owner + verified-2FA review gate seller tools. It is not identity/KYC verification. |
| Storefront | IMPLEMENTED | Seller profile editing and public verified-seller page exist. |
| Product creation and publication | IMPLEMENTED | Verified sellers submit validated listings into moderation; owner + verified-2FA review can approve/reject/remove/restore. Keyword screening is only a flag, not complete moderation. |
| Product images | IMPLEMENTED / PARTIALLY RELEASE-READY | Sellers can add, keep, and remove up to eight images. Uploads are capped at 2 MB, resized and converted to WebP with a 700 KB output limit; unused and removed files are cleaned up. Malware scanning and retention policy remain missing. |
| Inventory | IMPLEMENTED | Sellers can edit quantities and manage listings; checkout reserves stock and successful payment decrements it. |
| Orders and fulfilment | IMPLEMENTED (seller-arranged) | Seller order-management UI/API supports status, delivery notes, courier name, and HTTPS tracking details. Sellers arrange delivery; no external courier booking API is intended. Buyer must confirm receipt before payout is initiated. |
| Earnings and payouts | PARTIALLY IMPLEMENTED / PRODUCTION BLOCKED | 5% commission accounting, seller payout destination via Paystack, transfer initiation after buyer-confirmed delivery, and transfer webhook reconciliation are implemented. Paystack transfer approval, credentials, balance, live verification, failed/ambiguous-transfer reconciliation and retry operations, and payouts feature gate remain release requirements. |

### Buyer

| Journey step | Status | Evidence and limitation |
|---|---|---|
| Discovery and product details | IMPLEMENTED | Active listings, filters, seller pages, product details, and seller-only private previews exist. |
| Cart | IMPLEMENTED | Authenticated cart is backed by the marketplace schema and APIs. |
| Checkout and payment | PARTIALLY IMPLEMENTED / PRODUCTION BLOCKED | NGN Paystack initialization, server-side verification, callback, signed webhook handling, stock reservation, and idempotent application code exist. Checkout is fail-closed unless both `STORE_CHECKOUT_ENABLED=true` and `STORE_PAYOUTS_ENABLED=true`; production configuration and Paystack approvals are not evidenced. |
| Delivery fees | IMPLEMENTED | Buyer selects one active NGN delivery option per seller. Fee is included in checkout and passed through to that seller; checkout rejects missing or mismatched options. |
| Order tracking | PARTIALLY IMPLEMENTED | Buyer order history shows seller-entered fulfillment/tracking details. Sellers arrange delivery; no courier API or verified delivery scans. |
| Messaging | PARTIALLY IMPLEMENTED | Inbox, participant-checked conversations, block/report controls, and private attachment upload/download paths exist. Opt-in Web Push code is implemented but not configured or integration-tested; malware scanning remains absent. |
| Disputes and refunds | PARTIALLY IMPLEMENTED | Buyer/seller dispute and owner-reviewed refund paths exist; refunds use Paystack and webhook reconciliation. Automated dispute settlement and a complete refund reconciliation UI were not found. |

## Cross-cutting investigation

| Area | Status | Current evidence / gap |
|---|---|---|
| Commission calculation | IMPLEMENTED (5% configured in code) | 5% is calculated against seller item gross, excluding delivery; the delivery fee is passed through to the seller. Financial policy must be approved for launch. |
| Automated seller payouts | PARTIALLY IMPLEMENTED / PRODUCTION BLOCKED | Paystack recipient setup, buyer-confirmation-gated transfer initiation, unique payout ledger, and transfer event handling exist. Failed or ambiguous transfers do not have an automated retry/reconciliation worker and require an operations procedure. Transfers stay disabled unless `STORE_PAYOUTS_ENABLED=true`; provider account approval and reconciliation are unverified. |
| Product image lifecycle | IMPLEMENTED / PARTIALLY RELEASE-READY | Upload, initial attachment, listing edit/removal, and storage cleanup exist. Upload cap is 2 MB and optimized WebP cap is 700 KB. Scanning and retention remain gaps. |
| Seller order management | IMPLEMENTED (seller-arranged delivery) | Seller UI/API supports order status and tracking entry. It does not book shipments with an external carrier. |
| Notifications | PARTIALLY IMPLEMENTED | In-app and optional email plus opt-in VAPID Web Push code exist. Push uses the browser Web Push standard (no paid intermediary required) but requires VAPID keys and service-worker/browser end-to-end testing; no delivery guarantee or full event coverage. |
| Moderation and appeals | PARTIALLY IMPLEMENTED | Listing/report/dispute/verification/support work queues and appeal submission exist. Review remains owner + verified-2FA scoped; no delegated moderator roles or complete policy enforcement. |
| Security and RLS | PARTIALLY IMPLEMENTED / NOT TESTED | Migrations declare RLS, grants, and policies; service-role APIs perform additional ownership checks. No cross-account RLS/security integration test was run for this reconciliation. Migration-history agreement is not a test of live policy behavior. |
| Paystack | PARTIALLY IMPLEMENTED / PRODUCTION BLOCKED | Code implements NGN checkout and server-side verification, signed payment/refund/transfer webhooks, recipient setup, and seller transfer initiation. Account/transfer approval, production secrets, callback/webhook configuration, tax, and operational reconciliation are not verified. |
| Legal, privacy, and operations | PARTIALLY IMPLEMENTED | Draft policies, export/deletion request workflow, support, and moderation structures exist; legal approval, retention, automated deletion, operational service levels, and incident ownership remain open. |

## Database and production evidence

Read-only Supabase CLI migration-history output showed remote versions match local files through `20261111160000` before these enhancements. The new local migration `20261112100000_leox_store_delivery_payout_push.sql` has not been applied. This confirms recorded migration versions only and is not evidence of live RLS behavior, target environment, backups, or recoverability.

No production migration was applied and no deployment was performed for this reconciliation. Production status is **PRODUCTION BLOCKED** until the project/environment, Paystack account and approvals, payouts/commission, delivery/tax model, legal review, security/RLS, backups, monitoring, and end-to-end release gates are explicitly verified.

## Automated validation evidence

Record only results from commands run against the audit worktree in `LEOX_STORE_TEST_REPORT.md`. Static source-contract tests are not integration tests. Typecheck, lint, test, and build results do not prove Supabase RLS, Paystack sandbox/production behavior, or live readiness.

## Required before checkout can be enabled

1. Confirm the Supabase project identity and environment; review the new migration diff and a recoverable backup. Do not apply migrations without separate authorization.
2. Obtain Paystack marketplace/business and transfer approval; explicitly approve the 5% commission, merchant of record, settlement, chargeback/refund operations, seller delivery fees, and tax treatment.
3. Configure and test `STORE_CHECKOUT_ENABLED`, `STORE_PAYOUTS_ENABLED`, Paystack secrets, HTTPS callback, signed webhook delivery, duplicate and late payment handling, transfer failures, reconciliation, and operational alerts in a confirmed non-production environment.
4. Run authenticated cross-account RLS tests for listings, cart/orders, seller data, fulfillment, conversations/attachments, disputes, appeals, notifications, and moderation.
5. Configure VAPID keys, test browser opt-in, push delivery, unsubscribe and stale subscription removal; test image size limits/cleanup and seller delivery selection.
6. Complete end-to-end browser/mobile, accessibility, abuse/security, backup restore, rollback, and monitoring checks; record owners and evidence.
7. Only after written approval set both `STORE_CHECKOUT_ENABLED=true` and `STORE_PAYOUTS_ENABLED=true` in the intended environment.

## Rollback and migration safety

Do not roll back by dropping marketplace records or storage. Stop checkout/writes first, preserve payment/order evidence, and use a separately reviewed forward migration or approved recovery plan. Do not apply or reverse production migrations as part of this documentation reconciliation.
