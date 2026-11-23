import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const db = adminSupabase();
  const { data: affiliates, error } = await db.from('marketplace_affiliates').select('user_id').eq('status', 'approved').limit(500);
  if (error) return NextResponse.json({ error: 'Affiliate commission queue is unavailable.' }, { status: 503 });
  let released = 0;
  let notified = 0;
  for (const affiliate of affiliates ?? []) {
    const { error: releaseError } = await db.rpc('release_eligible_marketplace_affiliate_commissions', { p_affiliate_id: affiliate.user_id });
    if (releaseError) {
      console.error('Affiliate commission release failed:', releaseError.message);
      continue;
    }
    const { data: commissions, error: commissionError } = await db.from('marketplace_affiliate_commissions')
      .select('id,commission_kobo,eligible_at').eq('affiliate_id', affiliate.user_id).eq('status', 'eligible')
      .lte('eligible_at', new Date().toISOString()).order('eligible_at', { ascending: true }).limit(100);
    if (commissionError) continue;
    for (const commission of commissions ?? []) {
      released += 1;
      try {
        await notifyMarketplaceUser({
          userId: affiliate.user_id, kind: 'affiliate_commission_eligible',
          title: 'Your Braverton affiliate commission is eligible',
          body: `Commission ₦${(Number(commission.commission_kobo)/100).toLocaleString('en-NG')} passed its dispute window. You can request payout from your affiliate dashboard.`,
          href: '/store/affiliates', preference: 'support_updates',
          idempotencyKey: `affiliate-commission:${commission.id}:eligible`,
        });
        notified += 1;
      } catch (noticeError) {
        console.error('Affiliate eligibility notification failed:', noticeError instanceof Error ? noticeError.message : 'unknown error');
      }
    }
  }
  return NextResponse.json({ affiliatesProcessed: affiliates?.length ?? 0, eligibleCommissions: released, notificationsAttempted: notified }, { headers: { 'Cache-Control': 'no-store' } });
}
