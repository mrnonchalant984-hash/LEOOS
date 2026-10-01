import { getAdminSupabase } from '@/lib/auth';
import { planConfig, type PlanKey, type BillingPeriod } from '@/lib/pricing';

const creditsByPlan: Record<string, number> = { standard: 30, pro: 100, unlimited: 500 };

export async function verifyAndApplyPaystack(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');

  const admin = getAdminSupabase();
  const check = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result = await check.json();
  if (!check.ok || result.data?.status !== 'success') throw new Error(result.message || 'Payment could not be verified');

  const tx = result.data;
  const { data: payment, error } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle();
  if (error) throw error;
  if (!payment) throw new Error('Payment reference is not registered');
  if (payment.amount_kobo !== Number(tx.amount)) throw new Error('Verified amount does not match the registered purchase');
  if (payment.status === 'success') return { userId: payment.user_id, reference, alreadyApplied: true };

  await admin.from('payments').update({ status: 'success', paid_at: new Date().toISOString(), verified_at: new Date().toISOString(), paystack_reference: reference }).eq('id', payment.id);

  const plan = payment.plan as PlanKey;
  const billingPeriod = payment.billing_period as BillingPeriod;
  if (!planConfig[plan] || !['monthly', 'quarterly', 'yearly'].includes(billingPeriod)) throw new Error('Invalid plan or billing period');

  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + (billingPeriod === 'yearly' ? 12 : billingPeriod === 'quarterly' ? 3 : 1));

  await admin.from('subscriptions').update({ status: 'expired' }).eq('user_id', payment.user_id).eq('status', 'active');
  await admin.from('subscriptions').insert({ user_id: payment.user_id, plan, billing_period: billingPeriod, status: 'active', current_period_start: start.toISOString(), current_period_end: end.toISOString(), starts_at: start.toISOString(), ends_at: end.toISOString(), payment_reference: reference });

  const credits = creditsByPlan[plan] || 30;
  for (const feature of ['image_generation', 'code_generation', 'background_removal', 'website_deployment']) {
    await admin.from('credits').upsert({ user_id: payment.user_id, feature, credits_remaining: credits, credits_used: 0, last_reset: start.toISOString() }, { onConflict: 'user_id,feature' });
  }
  await admin.from('feature_access').upsert(['image_generation', 'code_generation', 'background_removal', 'website_deployment'].map(feature => ({ user_id: payment.user_id, feature_name: feature, has_access: true, granted_by: 'subscription', expires_at: end.toISOString() })), { onConflict: 'user_id,feature_name' });

  return { userId: payment.user_id, reference, alreadyApplied: false };
}
