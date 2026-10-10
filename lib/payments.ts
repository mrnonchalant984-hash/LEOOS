import { getAdminSupabase } from '@/lib/auth';
import type { PaystackTransaction } from '@/lib/payments-core';

type PaystackResult = {
  status?: boolean;
  message?: string;
  data?: PaystackTransaction;
};

async function requestPaystackTransaction(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(reference)) throw new Error('Payment reference is invalid');

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    },
  );
  const result = await response.json().catch(() => null) as PaystackResult | null;
  return { response, result };
}

/** Verify a provider transaction without applying a subscription-side effect. */
export async function verifyPaystackTransaction(reference: string): Promise<PaystackTransaction> {
  const { response, result } = await requestPaystackTransaction(reference);
  const transaction = result?.data;
  if (!response.ok || !result?.status || transaction?.status !== 'success') {
    throw new Error('Paystack has not confirmed a successful payment.');
  }
  if (String(transaction.reference || '') !== reference) {
    throw new Error('Verified payment reference does not match.');
  }
  return transaction;
}

export async function verifyAndApplyPaystack(reference: string) {
  const { response, result } = await requestPaystackTransaction(reference);
  const admin = getAdminSupabase();
  const tx = result?.data;

  if (!response.ok || !result?.status || tx?.status !== 'success') {
    if (tx && ['failed', 'abandoned'].includes(String(tx.status))) {
      const { error: updateError } = await admin
        .from('payments')
        .update({ status: 'failed', verified_at: new Date().toISOString() })
        .eq('reference', reference)
        .eq('status', 'pending');
      if (updateError) throw updateError;
    }
    throw new Error('Payment could not be verified.');
  }

  if (String(tx.reference || '') !== reference) throw new Error('Verified payment reference does not match.');

  const { data: payment, error } = await admin
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  if (!payment) throw new Error('Payment reference is not registered.');
  if (payment.amount_kobo !== Number(tx.amount)) throw new Error('Verified amount does not match the registered purchase.');
  if (payment.currency && String(payment.currency).toUpperCase() !== String(tx.currency || '').toUpperCase()) {
    throw new Error('Verified currency does not match the registered purchase.');
  }

  const metadata = typeof tx.metadata === 'object' && tx.metadata !== null
    ? tx.metadata as Record<string, unknown>
    : {};
  if (String(metadata.user_id || '') !== payment.user_id) throw new Error('Verified payment owner does not match the registered purchase.');
  if (metadata.plan !== payment.plan) throw new Error('Verified plan does not match the registered purchase.');
  if (metadata.billing_period !== payment.billing_period) throw new Error('Verified billing period does not match the registered purchase.');

  const paidAt = tx.paid_at ? new Date(String(tx.paid_at)).toISOString() : new Date().toISOString();
  const { data: applied, error: applyError } = await admin.rpc(
    'apply_verified_subscription_payment',
    { p_reference: reference, p_paid_at: paidAt },
  );
  if (applyError) throw applyError;

  return { userId: payment.user_id, reference, alreadyApplied: applied === false };
}
