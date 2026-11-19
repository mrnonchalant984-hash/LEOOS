import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '') || '';
  if (!secret || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: 'Paystack is not configured.' }, { status: 503 });

  const db = adminSupabase();
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: payouts, error } = await db.from('marketplace_seller_payouts')
    .select('id,reference,status,created_at,net_kobo,recipient_code')
    .in('status', ['initiating', 'unknown', 'pending'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Payout reconciliation queue is unavailable.' }, { status: 503 });

  let checked = 0;
  let updated = 0;
  let inconclusive = 0;
  for (const payout of payouts ?? []) {
    checked += 1;
    try {
      const response = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(payout.reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== true || !result?.data || result.data.reference !== payout.reference
        || Number(result.data.amount) !== Number(payout.net_kobo) || String(result.data.currency).toUpperCase() !== 'NGN'
        || result.data.recipient?.recipient_code !== payout.recipient_code) {
        inconclusive += 1;
        continue;
      }
      const providerStatus = typeof result.data.status === 'string' ? result.data.status.toLowerCase() : '';
      const status = providerStatus === 'success' ? 'paid'
        : providerStatus === 'failed' || providerStatus === 'rejected' || providerStatus === 'abandoned' ? 'failed'
        : providerStatus === 'reversed' ? 'reversed'
        : providerStatus === 'pending' || providerStatus === 'otp' || providerStatus === 'received' || providerStatus === 'queued' ? 'pending'
        : null;
      if (!status) { inconclusive += 1; continue; }
      const { error: updateError } = await db.from('marketplace_seller_payouts')
        .update({
          status,
          provider_transfer_status: providerStatus,
          transfer_code: typeof result.data.transfer_code === 'string' ? result.data.transfer_code : undefined,
          failure_reason: status === 'failed' ? 'Paystack reports a failed transfer; operator review is required before any retry.' : null,
          last_provider_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payout.id)
        .eq('status', payout.status);
      if (updateError) throw updateError;
      updated += 1;
    } catch (cause) {
      inconclusive += 1;
      console.error('Store payout reconciliation failed:', cause instanceof Error ? cause.message : 'unknown error');
    }
  }

  return NextResponse.json({ checked, updated, inconclusive }, { headers: { 'Cache-Control': 'no-store' } });
}
