import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { data, error } = await adminSupabase().from('api_plan_subscriptions')
    .select('plan_key,status,currency,monthly_amount_minor,current_period_start,current_period_end,included_credits,credits_remaining')
    .eq('user_id', ctx.user.id).eq('status', 'active').gt('current_period_end', new Date().toISOString())
    .order('current_period_end', { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: 'Billing status could not be loaded.' }, { status: 503 });
  return NextResponse.json({ active: Boolean(data), subscription: data || null, renewalMode: 'manual' }, { headers: { 'Cache-Control': 'no-store' } });
}
