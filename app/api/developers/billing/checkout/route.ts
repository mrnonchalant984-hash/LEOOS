import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { getApiPlan, getApiPlanPriceMinor, type ApiPlanCurrency } from '@/lib/api-plan-catalog';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function callbackUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured ? new URL(configured) : req.nextUrl;
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') throw new Error('A secure site URL is required for checkout.');
  return new URL('/payment/callback?type=api_plan', base.origin).toString();
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to purchase an API plan.' }, { status: 401 });
  if (!ctx.user.email) return NextResponse.json({ error: 'An account email is required for checkout.' }, { status: 400 });
  if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ error: 'API checkout is not configured yet.' }, { status: 503 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'api-plan-checkout', 5, 60);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const planKey = typeof body.plan_key === 'string' ? body.plan_key : '';
  const currency = body.currency === 'USD' ? 'USD' : body.currency === 'NGN' ? 'NGN' : null;
  if (!currency) return NextResponse.json({ error: 'Choose NGN or USD.' }, { status: 400 });
  const plan = getApiPlan(planKey);
  const amountMinor = getApiPlanPriceMinor(planKey, currency as ApiPlanCurrency);
  if (!plan || !amountMinor || planKey === 'developer' || planKey === 'enterprise') return NextResponse.json({ error: 'Choose an available paid API plan.' }, { status: 400 });

  const reference = `leo_api_${randomUUID().replaceAll('-', '')}`;
  const db = adminSupabase();
  const { error: insertError } = await db.from('api_plan_payments').insert({ user_id: ctx.user.id, reference, plan_key: planKey, currency, amount_minor: amountMinor, status: 'pending' });
  if (insertError) return NextResponse.json({ error: 'Checkout could not be registered. Please try again.' }, { status: 503 });

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ctx.user.email, amount: amountMinor, currency, reference, callback_url: callbackUrl(req), metadata: { type: 'api_plan', user_id: ctx.user.id, plan_key: planKey, currency } }),
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.status || typeof result?.data?.authorization_url !== 'string') {
      await db.from('api_plan_payments').update({ status: 'failed' }).eq('reference', reference).eq('status', 'pending');
      return NextResponse.json({ error: 'The payment provider could not start checkout. Confirm that your account supports this currency and try again.' }, { status: 502 });
    }
    return NextResponse.json({ authorization_url: result.data.authorization_url, reference }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await db.from('api_plan_payments').update({ status: 'failed' }).eq('reference', reference).eq('status', 'pending');
    if (error instanceof Error && error.message.includes('secure site URL')) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: 'Payment initialization failed. Please try again.' }, { status: 502 });
  }
}
