import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view seller analytics.' }, { status: 401 });
  const { data, error } = await adminSupabase().rpc('get_marketplace_seller_metrics', { p_seller_id: user.id });
  if (error || !data) return NextResponse.json({ error: 'Seller dashboard data is unavailable.' }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
