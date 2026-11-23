import { adminSupabase } from '@/lib/auth';
import { assertStoreSettlementReady } from '@/lib/store/settlement-provider';

type MarketplacePayout = {
  id: string;
  reference: string;
  recipient_code: string;
  net_kobo: number;
};

export async function initiateMarketplacePayout(payout: MarketplacePayout) {
  assertStoreSettlementReady();
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) throw new Error('Paystack transfers are not configured.');

  let response: Response;
  try {
    response = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'balance',
        amount: Number(payout.net_kobo),
        recipient: payout.recipient_code,
        reason: 'LeoX Store seller payout after buyer-confirmed delivery',
        reference: payout.reference,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    // A network timeout does not prove Paystack rejected the transfer. Keep
    // the payout non-retryable and let the signed provider webhook reconcile it.
    const { error } = await adminSupabase().from('marketplace_seller_payouts')
      .update({
        status: 'pending',
        failure_reason: 'Transfer outcome is uncertain. Reconcile with Paystack before retrying.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payout.id).eq('status', 'initiating');
    if (error) {
      console.error('Uncertain marketplace payout could not be marked pending:', error.message);
      throw new Error('Transfer outcome is uncertain and local reconciliation state could not be saved.');
    }
    return { status: 'pending' as const };
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== true || typeof result?.data?.transfer_code !== 'string') {
    const message = typeof result?.message === 'string' ? result.message.slice(0, 500) : 'Paystack did not accept the transfer.';
    const { error } = await adminSupabase().from('marketplace_seller_payouts')
      .update({ status: 'failed', failure_reason: message, updated_at: new Date().toISOString() })
      .eq('id', payout.id).eq('status', 'initiating');
    if (error) console.error('Marketplace payout failure could not be recorded:', error.message);
    throw new Error(message);
  }

  const { error } = await adminSupabase().from('marketplace_seller_payouts')
    .update({ status: 'pending', transfer_code: result.data.transfer_code, updated_at: new Date().toISOString() })
    .eq('id', payout.id).eq('status', 'initiating');
  if (error) {
    console.error('Marketplace payout transfer started but local state could not be updated:', error.message);
    throw new Error('Transfer started; provider webhook reconciliation is required.');
  }
  return { status: 'pending' as const };
}
