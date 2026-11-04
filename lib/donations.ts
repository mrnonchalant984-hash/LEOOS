import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { verifyPaystackTransaction } from '@/lib/payments';
import { parseDonationAmount } from './donation-input';

export { DONATION_MAX_KOBO, DONATION_MIN_KOBO, parseDonationAmount } from './donation-input';

export function createDonationReference() {
  return `don_${randomUUID().replaceAll('-', '')}`;
}

export async function verifyAndConfirmDonation(reference: string) {
  const db = adminSupabase();
  const { data: donation, error } = await db.from('donations')
    .select('id,user_id,email,amount_kobo,currency,payment_status,transaction_reference')
    .eq('transaction_reference', reference)
    .maybeSingle();
  if (error) throw error;
  if (!donation) throw new Error('Donation reference is not registered.');

  const transaction = await verifyPaystackTransaction(reference);
  const providerTransaction = transaction as typeof transaction & { customer?: { email?: unknown } };
  const metadata = typeof transaction.metadata === 'object' && transaction.metadata !== null
    ? transaction.metadata as Record<string, unknown>
    : {};
  const transactionEmail = typeof providerTransaction.customer?.email === 'string'
    ? providerTransaction.customer.email.trim().toLowerCase()
    : '';
  if (metadata.type !== 'donation' || metadata.donation_id !== reference
    || Number(transaction.amount) !== Number(donation.amount_kobo)
    || String(transaction.currency || '').toUpperCase() !== donation.currency
    || transactionEmail !== donation.email.trim().toLowerCase()) {
    throw new Error('Verified payment does not match the registered donation.');
  }

  const paidAtValue = typeof transaction.paid_at === 'string' || typeof transaction.paid_at === 'number'
    ? transaction.paid_at
    : null;
  const paidAt = paidAtValue !== null && Number.isFinite(new Date(paidAtValue).getTime())
    ? new Date(paidAtValue).toISOString()
    : new Date().toISOString();
  const { data: applied, error: applyError } = await db.rpc('confirm_donation_payment', {
    p_reference: reference,
    p_amount_kobo: donation.amount_kobo,
    p_currency: donation.currency,
    p_paid_at: paidAt,
  });
  if (applyError) throw applyError;
  return { alreadyApplied: applied === false };
}
