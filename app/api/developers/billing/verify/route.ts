import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to verify this payment.' }, { status: 401 });
  if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ error: 'Payment verification is not configured.' }, { status: 503 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'api-plan-verify', 10, 60);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const reference = typeof body.reference === 'string' ? body.reference.slice(0, 100) : '';
  if (!/^leo_api_[a-f0-9]{32}$/i.test(reference)) return NextResponse.json({ error: 'Invalid API payment reference.' }, { status: 400 });

  const db = adminSupabase();
  const { data: payment, error: paymentError } = await db.from('api_plan_payments').select('user_id,reference,plan_key,currency,amount_minor,status').eq('reference', reference).eq('user_id', ctx.user.id).maybeSingle();
  if (paymentError || !payment) return NextResponse.json({ error: 'This API payment could not be found for your account.' }, { status: 404 });
  if (payment.status === 'succeeded') return NextResponse.json({ ok: true, alreadyApplied: true });
  if (payment.status !== 'pending') return NextResponse.json({ error: 'This payment is no longer pending.' }, { status: 409 });

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    const result = await response.json().catch(() => null);
    const transaction = result?.data;
    if (!response.ok || !result?.status || transaction?.status !== 'success' || transaction?.reference !== reference || Number(transaction?.amount) !== Number(payment.amount_minor) || transaction?.currency !== payment.currency) {
      return NextResponse.json({ error: 'Payment is not confirmed yet. No API access has been activated.' }, { status: 409 });
    }
    const customerEmail = typeof transaction?.customer?.email === 'string' ? transaction.customer.email.toLowerCase() : '';
    if (ctx.user.email && customerEmail && customerEmail !== ctx.user.email.toLowerCase()) return NextResponse.json({ error: 'The payment customer does not match this account.' }, { status: 409 });
    const providerTransactionId = String(transaction.id ?? reference).slice(0, 120);
    const { data: activation, error: activationError } = await db.rpc('activate_api_plan_payment', { p_reference: reference, p_provider_transaction_id: providerTransactionId });
    if (activationError || !activation) return NextResponse.json({ error: 'Payment was verified, but API activation needs another attempt. Contact support if this persists.' }, { status: 503 });
    return NextResponse.json({ ok: true, alreadyApplied: Boolean(activation.already_applied), creditsRemaining: activation.credits_remaining ?? null });
  } catch {
    return NextResponse.json({ error: 'Payment verification is temporarily unavailable.' }, { status: 502 });
  }
}
