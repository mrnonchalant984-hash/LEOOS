# Braverton Market implementation status

Branch: `braverton-market-launch-readiness`

This report separates code changes from external operational checks. A source implementation is not proof of production configuration or a completed transaction.

## Implemented on this branch
- Replaced public-facing store wording in the marketplace landing, seller workspace and public seller storefront.
- Added an additive migration for seller-entered WhatsApp number, public contact email, location and delivery information.
- Extended the seller profile API to validate and persist those fields. WhatsApp must be explicitly supplied in international format; private authentication phone data is never copied.
- Added seller-dashboard inputs for those fields.
- Added public display of seller-supplied contact and delivery information only on verified storefronts. The page explicitly states that delivery is arranged by the seller or their chosen provider, not Braverton Market.
- Added source-level regression tests for contact privacy and storefront display.

## Existing marketplace foundations found in the branch
- Product catalogue and verified-seller filtering.
- Seller verification request submission and seller listing access checks.
- Buyer cart, checkout and order APIs.
- Buyer order history and delivery/fulfilment records.
- Messaging, in-app notifications and push subscription support.
- Affiliate attribution/commission/payout-request foundations.
- Supplier and dropship product/fulfilment foundations.
- Paystack checkout/webhook and seller payout code paths with environment gates.

These are code-presence observations only. They are not a claim that each workflow has passed end-to-end acceptance.

## Still not proven / remaining work
- Bram-driven risk assessment, safe auto-approval thresholds, escalation and auditable owner override for seller applications.
- Complete unique Braverton order-reference lifecycle and buyer/seller timeline verification across every order state.
- End-to-end notification event matrix, email/push delivery evidence, preference enforcement and idempotent retry behavior.
- Full affiliate and dropship request/approval/settlement lifecycle tests with distinct ledgers.
- Buyer account isolation and complete regression tests.
- Controlled Paystack transaction, seller settlement and reconciliation. Do not enable payout gates or move real funds without separate owner authorization.
- Supabase backup/PITR plan assessment, automated backup configuration, object-storage recovery, non-production restore drill, monitoring and incident runbook. These require project access and operational credentials not present in this branch.
- Full typecheck, lint, unit/integration suite and production build.

## Safety and release boundary
- No production migration was run.
- No production secrets or feature gates were changed.
- No payment or payout was initiated.
- This branch has not been merged or deployed.
- Continue additive implementation and verification on this branch. Do not merge or deploy until the owner reviews evidence and explicitly approves.
