import { NextRequest, NextResponse } from 'next/server';
import { processDueDeliveries } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await processDueDeliveries());
}
