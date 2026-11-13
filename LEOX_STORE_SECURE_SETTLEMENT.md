# LeoX Store — provider-dependent settlement boundary

## Current implementation

- Checkout and payment verification remain Paystack-backed.
- Seller payout accounting is created only after the order is paid, delivery is marked delivered, and the buyer confirms delivery.
- The transfer adapter sends a Paystack Transfer from the Paystack business balance to a verified recipient when `STORE_PAYOUTS_ENABLED=true` and `PAYSTACK_SECRET_KEY` is configured.
- Payout records and provider transfer references are persisted for reconciliation.
- Affiliate commission is a separate accounting liability. It is created only after every fulfillment is buyer-confirmed and no open/reviewing dispute exists; its eligibility date is delayed by seven days.

## What this is not

This is **not escrow**, a stored-value wallet, or a LeonardX-held customer-funds account. The application does not claim to custody or safeguard customer funds. Delayed transfers from a provider balance are not automatically equivalent to regulated escrow.

## Provider-managed split settlement

Paystack documents split payments through subaccounts and split groups. That is a separate provider-managed settlement capability from the Transfers API. The current LeoX checkout does not yet dynamically map each seller in a multi-seller cart to an approved Paystack subaccount and compute a verified split for that exact cart. Therefore the platform must not claim that provider-managed split settlement is active.

Before enabling that mode, the business account owner and payment provider must confirm eligibility, account verification, fee allocation, refunds, disputes, settlement timing, webhook reconciliation, and applicable legal requirements. No age, identity, or business verification checks should be bypassed.

Official provider references:
- https://paystack.com/docs/payments/split-payments/
- https://paystack.com/docs/payments/multi-split-payments/
- https://paystack.com/docs/api/split/

## Runtime gate

`lib/store/settlement-provider.ts` exposes the actual configured mode to the owner commerce dashboard. It reports `disabled` unless both the payout feature flag and server-side Paystack secret are present. The only implemented active mode is `delayed_transfer_after_buyer_confirmed_delivery`; `escrow` and `providerManagedSplit` are explicitly false.
