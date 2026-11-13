# LeoX Store provider integrations

This release adds provider-gated settlement and supplier dispatch adapters. It does not activate any production money movement or connect an external supplier until the deployment owner configures and verifies the required providers.

## 1. Paystack multi-vendor split settlement

The checkout route supports Paystack dynamic multi-split settlement. Paystack's official guide documents the `split` transaction payload with `type: flat`, `bearer_type`, and one or more `{ subaccount, share }` entries; seller subaccounts must exist before checkout.

Configuration:

- `STORE_PAYSTACK_SPLIT_ENABLED=false` by default. Keep false until the registered business has Paystack approval for the marketplace split arrangement and the split math has been reconciled in a Paystack test environment.
- `PAYSTACK_SECRET_KEY` must be set server-side.
- Each seller must re-verify their payout bank destination after split mode is enabled. The payout-account API creates a Paystack subaccount and stores only its `subaccount_code` plus masked bank details.
- Checkout calculates each seller's line-item total and applies the current 5% platform commission. It sends each seller's remaining share as a flat split. The platform receives the remainder. Delivery charges are not included in the current order total model.
- If any participating seller lacks a subaccount, checkout fails closed rather than silently collecting the entire payment into the platform account.

This is provider-managed settlement, not escrow. Paystack controls settlement according to the account's approved configuration. Refunds, chargebacks, provider fees, tax and seller contract terms still require a verified reconciliation policy.

## 2. Affiliate cash-out

The affiliate flow now supports:

1. Paystack-verified affiliate payout destinations.
2. Affiliate-initiated payout requests for commissions that have become `eligible` after delivery, buyer confirmation, dispute checks and the seven-day eligibility delay.
3. Owner-only approval/rejection queue at `/admin/store/affiliate-payouts`.
4. Owner-only Paystack transfer initiation and a reference-based transfer verification path.
5. Idempotent commission/request/payout records so a commission cannot be paid twice by concurrent requests.

Configuration:

- `AFFILIATE_PAYOUTS_ENABLED=false` by default.
- Do not enable until the business account, provider permissions, tax/accounting treatment, payout terms and adult/legal owner approval are in place. A pending or uncertain provider transfer must be reconciled by its Paystack reference before any retry.
- Paystack transfer status `pending` remains `processing`; the system does not mark a transfer paid until Paystack reports success.
- This is a payout ledger and provider transfer workflow, not a LeonardX wallet or stored-value balance.

## 3. External supplier dispatch

Paid marketplace orders enqueue supplier fulfilment rows. The payment webhook now attempts immediate dispatch; a protected retry worker is available at `POST /api/cron/store/supplier-dispatch` using `Authorization: Bearer $CRON_SECRET`.

Configuration:

- `STORE_SUPPLIER_CONNECTORS_JSON` is a server-only JSON object keyed by supplier user UUID. Example shape:

  ```json
  {
    "SUPPLIER_USER_UUID": {
      "provider": "supplier-api-name",
      "endpoint": "https://api.supplier.example/v1/fulfillments",
      "token": "SERVER_SIDE_API_TOKEN"
    }
  }
  ```

- `STORE_SUPPLIER_CONNECTOR_ALLOWED_HOSTS` is a comma-separated exact hostname allowlist, for example `api.supplier.example`. Endpoints must be HTTPS, use port 443, and match this allowlist. Never put supplier credentials in browser code, database rows, logs, or chat.
- The adapter sends `POST` with `Authorization: Bearer ...`, `Idempotency-Key`, `X-LeonardX-Event: fulfillment.create`, and JSON `{ event, version, fulfillment: { id, order_id, supplier_sku, quantity } }`.
- A supplier must respond with HTTP 2xx and JSON `{ "accepted": true, "reference": "supplier-reference" }`. A different supplier API requires a supplier-specific adapter and a tested field mapping; do not assume every supplier uses this contract.
- Configure a scheduler to call the retry worker regularly. The payment webhook is the immediate dispatch attempt; the worker retries requests that remain `requested`.

The adapter uses a host allowlist and idempotency key to reduce SSRF and duplicate-order risks. Supplier-side idempotency is still required. A timeout can mean the supplier accepted the order but its response was lost; check the supplier's reference before manually resubmitting.

## 4. Staging release checklist

- Apply migrations in order, including `20261113130000_leox_supplier_dispatch_split_and_affiliate_payouts.sql`.
- Run the full typecheck, lint, production build and test suite with the lockfile dependencies installed.
- Use Paystack test credentials and test subaccounts; verify multi-seller and single-seller order totals, platform commission, refunds and failed payments.
- Test affiliate request approval, duplicate requests, pending transfers, successful transfers and failed transfers. Reconcile the provider ledger.
- Test each supplier connector against its own sandbox, including timeouts, duplicate idempotency keys, invalid responses and stock/fulfilment updates.
- Keep both payout feature flags false until business/provider/legal approval is complete.
- Do not deploy these changes to production or run a real transfer as part of testing.
