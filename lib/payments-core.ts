export type PaystackTransaction = {
  status?: unknown;
  reference?: unknown;
  amount?: unknown;
  currency?: unknown;
  paid_at?: unknown;
  metadata?: unknown;
};

export type HostingRenewalExpectation = {
  reference: string;
  hostingId: string;
  websiteProjectId: string;
  amountKobo: number;
};

/** Strictly match a verified provider transaction to the registered renewal intent. */
export function matchesHostingRenewal(
  transaction: PaystackTransaction,
  expected: HostingRenewalExpectation,
): boolean {
  if (!transaction || typeof transaction.metadata !== 'object' || transaction.metadata === null) return false;
  const metadata = transaction.metadata as Record<string, unknown>;
  return transaction.status === 'success'
    && transaction.reference === expected.reference
    && Number(transaction.amount) === expected.amountKobo
    && typeof transaction.currency === 'string'
    && transaction.currency.toUpperCase() === 'NGN'
    && metadata.type === 'hosting_renewal'
    && String(metadata.hosting_id || '') === expected.hostingId
    && String(metadata.website_project_id || '') === expected.websiteProjectId;
}
