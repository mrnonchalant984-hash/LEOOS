/**
 * Provider-gated seller settlement status. This integration uses Paystack
 * Transfers after buyer-confirmed delivery or Paystack provider-managed split
 * settlement when explicitly enabled; this is not an escrow or wallet.
 */
export function getStoreSettlementStatus() {
  const enabled = process.env.STORE_PAYOUTS_ENABLED === 'true' && Boolean(process.env.PAYSTACK_SECRET_KEY?.trim());
  return {
    provider: 'paystack' as const,
    mode: enabled ? (process.env.STORE_PAYSTACK_SPLIT_ENABLED === 'true' ? 'paystack_provider_managed_multi_split' as const : 'delayed_transfer_after_buyer_confirmed_delivery' as const) : 'disabled' as const,
    enabled,
    escrow: false as const,
    providerManagedSplit: enabled && process.env.STORE_PAYSTACK_SPLIT_ENABLED === 'true',
    requirements: process.env.STORE_PAYSTACK_SPLIT_ENABLED === 'true' ? ['Registered business and Paystack approval for multi-split', 'Every participating seller has a verified Paystack subaccount', 'Split shares reconciled against order line totals', 'Payment verification and refund/dispute reconciliation'] : ['Registered business and eligible Paystack integration', 'Verified seller payout recipient', 'Buyer-confirmed delivery', 'No open dispute or payment reversal'],
  };
}

export function assertStoreSettlementReady() {
  const status = getStoreSettlementStatus();
  if (!status.enabled) throw new Error('Marketplace seller settlement is disabled or Paystack is not configured.');
  return status;
}
