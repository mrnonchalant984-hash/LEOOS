import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference') || '';
  if (!/^hosting_[A-Za-z0-9_-]{1,200}$/.test(reference)) {
    return NextResponse.json({ status: 'unknown' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await adminSupabase().from('hosting_renewal_payments')
    .select('status')
    .eq('reference', reference)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Payment status is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const status = data?.status === 'succeeded' ? 'confirmed'
    : data?.status === 'failed' ? 'failed'
      : data?.status === 'pending' ? 'pending'
        : 'unknown';
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store', 'Retry-After': '3' } });
}
