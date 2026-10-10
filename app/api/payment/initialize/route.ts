import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, adminSupabase } from '@/lib/auth';
import { getPlanPrice, planConfig, type BillingPeriod, type PaidPlanKey } from '@/lib/pricing';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const billingPeriods: BillingPeriod[] = ['monthly', 'quarterly', 'yearly'];

function paymentCallbackUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured ? new URL(configured) : req.nextUrl;
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('A verified HTTPS site URL is required for checkout.');
  }
  return new URL('/payment/callback', base.origin).toString();
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
    }

    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Please log in before purchasing a plan.' }, { status: 401 });
    if (!user.email) return NextResponse.json({ error: 'A verified email is required for checkout.' }, { status: 400 });
    const limited = await enforceUserRateLimit(user.id, 'subscription-checkout', 5, 60);
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const requestedPlan = typeof body?.plan === 'string' ? body.plan : '';
    const requestedPeriod = typeof body?.billing_period === 'string' ? body.billing_period : '';
    if (!Object.hasOwn(planConfig, requestedPlan) || !billingPeriods.includes(requestedPeriod as BillingPeriod)) {
      return NextResponse.json({ error: 'Choose a valid plan and billing period.' }, { status: 400 });
    }

    const plan = requestedPlan as PaidPlanKey;
    const billingPeriod = requestedPeriod as BillingPeriod;
    const amount = getPlanPrice(plan, billingPeriod);
    if (!amount || !Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'This plan price is not configured.' }, { status: 503 });
    }

    const reference = `leo_${randomUUID().replaceAll('-', '')}`;
    const db = adminSupabase();
    const { error: paymentInsertError } = await db.from('payments').insert({
      user_id: user.id,
      reference,
      plan,
      billing_period: billingPeriod,
      amount_kobo: amount,
      currency: 'NGN',
      status: 'pending',
    });
    if (paymentInsertError) {
      return NextResponse.json({ error: 'Checkout could not be registered. Please try again.' }, { status: 503 });
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount,
        reference,
        callback_url: paymentCallbackUrl(req),
        metadata: { user_id: user.id, plan, billing_period: billingPeriod },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.status || typeof result?.data?.authorization_url !== 'string') {
      await db.from('payments').update({ status: 'failed', verified_at: new Date().toISOString() })
        .eq('reference', reference).eq('status', 'pending');
      return NextResponse.json({ error: 'Paystack could not start checkout. Please try again.' }, { status: 502 });
    }

    return NextResponse.json({ authorization_url: result.data.authorization_url, reference }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'A verified HTTPS site URL is required for checkout.') {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Payment initialization failed. Please try again.' }, { status: 500 });
  }
}
