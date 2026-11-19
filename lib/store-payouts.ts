import { adminSupabase } from '@/lib/auth';
import { assertStoreSettlementReady } from '@/lib/store/settlement-provider';

type MarketplacePayout = {
  id: string;
  reference: string;
  recipient_code: string;
  net_kobo: number;
};

async function markPayoutUnknown(payoutId: string, reason: string) {
  const { error } = await adminSupabase().from('marketplace_seller_payouts')
    .update({
      status: 'unknown',
      failure_reason: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payoutId)
    .eq('status', 'initiating');
  if (error) console.error('Ambiguous marketplace payout state could not be recorded:', error.message);
}

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
    await markPayoutUnknown(payout.id, 'Transfer request outcome is unknown; reconcile by the original reference before any retry.');
    throw new Error('Transfer outcome is unknown and requires provider reconciliation.');
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result?.message === 'string' ? result.message.slice(0, 500) : 'Paystack transfer request failed.';
    if (response.status >= 500) {
      await markPayoutUnknown(payout.id, 'Paystack returned a server error; verify the original transfer reference before retrying.');
      throw new Error('Transfer outcome is unknown and requires provider reconciliation.');
    }
    const { error } = await adminSupabase().from('marketplace_seller_payouts')
      .update({ status: 'failed', failure_reason: message, updated_at: new Date().toISOString() })
      .eq('id', payout.id).eq('status', 'initiating');
    if (error) console.error('Marketplace payout failure could not be recorded:', error.message);
    throw new Error(message);
  }

  if (result?.status !== true || typeof result?.data?.transfer_code !== 'string') {
    await markPayoutUnknown(payout.id, 'Paystack response was inconclusive; verify the original transfer reference before retrying.');
    throw new Error('Transfer outcome is unknown and requires provider reconciliation.');
  }

  const { error } = await adminSupabase().from('marketplace_seller_payouts')
    .update({
      status: 'pending',
      transfer_code: result.data.transfer_code,
      provider_transfer_status: typeof result.data.status === 'string' ? result.data.status : 'pending',
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payout.id).eq('status', 'initiating');
  if (error) {
    console.error('Marketplace payout transfer started but local state could not be updated:', error.message);
    throw new Error('Transfer started; provider webhook or reconciliation is required.');
  }
  return { status: 'pending' as const };
}
