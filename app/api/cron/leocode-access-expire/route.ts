import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';

async function expire(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Expiration job is not configured.' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const { data, error } = await adminSupabase().rpc('expire_leocode_entitlements');
  if (error) {
    console.error('LeoCode expiration job failed', { error: error.message });
    return NextResponse.json({ error: 'LeoCode entitlements could not be expired.' }, { status: 503 });
  }
  return NextResponse.json({ expired: Number(data) || 0 }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  return expire(req);
}

export async function POST(req: NextRequest) {
  return expire(req);
}
