import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { notifyMarketplaceUser } from '@/lib/store-notifications';
import { scoreSellerVerificationRisk } from '@/lib/store/seller-verification-risk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENGINE_VERSION = 'braverton-seller-risk-v1';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (process.env.BRAM_STORE_VERIFICATION_ENABLED !== 'true') {
    return NextResponse.json({ enabled: false, processed: 0, message: 'Bram seller verification is disabled until its owner-approved feature flag is enabled.' }, { status: 503 });
  }

  const db = adminSupabase();
  const { data: requests, error } = await db.from('marketplace_seller_verification_requests')
    .select('id,seller_id,business_name,country_code,details,evidence_url,evidence_notes,status')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(20);
  if (error) return NextResponse.json({ error: 'Seller verification queue is unavailable.' }, { status: 503 });

  const requestIds = (requests ?? []).map(item => item.id);
  const { data: priorDecisions, error: priorError } = requestIds.length
    ? await db.from('marketplace_seller_verification_decisions').select('request_id').in('request_id', requestIds).eq('engine_version', ENGINE_VERSION)
    : { data: [], error: null };
  if (priorError) return NextResponse.json({ error: 'Bram decision history is unavailable.' }, { status: 503 });
  const alreadyReviewed = new Set((priorDecisions ?? []).map(row => row.request_id));
  const results: Array<{ requestId: string; outcome: string; riskScore: number }> = [];
  for (const item of requests ?? []) {
    if (alreadyReviewed.has(item.id)) continue;
    const [{ data: authResult, error: authError }, { data: profile, error: profileError }, { data: existingSeller, error: sellerError }, { data: duplicateRequest, error: duplicateError }] = await Promise.all([
      db.auth.admin.getUserById(item.seller_id),
      db.from('profiles').select('created_at').eq('id', item.seller_id).maybeSingle(),
      db.from('marketplace_sellers').select('user_id').ilike('display_name', item.business_name.trim()).neq('user_id', item.seller_id).limit(1),
      db.from('marketplace_seller_verification_requests').select('id').neq('id', item.id).ilike('business_name', item.business_name.trim()).in('status', ['pending', 'approved']).limit(1),
    ]);
    if (authError || profileError || sellerError || duplicateError) {
      results.push({ requestId: item.id, outcome: 'deferred_data_check_failed', riskScore: 100 });
      continue;
    }
    const authUser = authResult.user;
    const createdAt = profile?.created_at || authUser?.created_at;
    const accountAgeDays = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000 : 0;
    const risk = scoreSellerVerificationRisk({
      emailConfirmed: Boolean(authUser?.email_confirmed_at),
      accountAgeDays,
      businessName: item.business_name,
      details: item.details,
      duplicateBusiness: Boolean((existingSeller ?? []).length || (duplicateRequest ?? []).length),
      evidenceUrl: item.evidence_url,
    });
    const signals = risk.signals;
    const score = risk.riskScore;
    const autoApprove = risk.outcome === 'auto_approved';
    const outcome = risk.outcome;
    const rationale = autoApprove
      ? 'Bram rules v1: confirmed account email, account age of at least seven days, complete business context, and no exact-name duplicate or external-link signal. This is marketplace seller-access approval, not government identity or business-registration certification.'
      : `Bram rules v1 escalated this application for owner review. Signals: ${signals.join(', ') || 'additional review required'}. No automatic rejection was made.`;
    const { data: decision, error: decisionError } = await db.rpc('finalize_marketplace_seller_verification', {
      p_request_id: item.id, p_outcome: outcome, p_risk_score: score,
      p_risk_signals: signals, p_rationale: rationale, p_engine_version: ENGINE_VERSION,
    });
    if (decisionError) {
      console.error('Bram seller verification decision failed:', decisionError.message);
      results.push({ requestId: item.id, outcome: 'decision_failed', riskScore: score });
      continue;
    }
    results.push({ requestId: item.id, outcome: decision?.outcome ?? outcome, riskScore: score });
    if (autoApprove && decision?.processed === true) {
      try {
        await notifyMarketplaceUser({
          userId: item.seller_id, kind: 'seller_verification', title: 'Your Braverton Market seller profile is approved',
          body: 'Your seller tools are now unlocked. You can manage your storefront and add product listings.',
          href: '/store/seller', preference: 'order_updates', idempotencyKey: `seller-verification:${item.id}:approved`,
        });
      } catch (notificationError) {
        console.error('Seller approval notification failed:', notificationError instanceof Error ? notificationError.message : 'unknown error');
      }
    }
  }
  return NextResponse.json({ enabled: true, processed: results.length, results }, { headers: { 'Cache-Control': 'no-store' } });
}
