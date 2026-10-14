import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view your credits.' }, { status: 401 });
  const db = adminSupabase();
  const { data, error } = await db.from('platform_credit_accounts').select('balance,total_granted,total_spent,updated_at').eq('user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Platform credit balance is unavailable. The required database migration may not be applied yet.' }, { status: 503 });
  return NextResponse.json({ platform_credits: data?.balance ?? 0, total_granted: data?.total_granted ?? 0, total_spent: data?.total_spent ?? 0, updated_at: data?.updated_at ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
