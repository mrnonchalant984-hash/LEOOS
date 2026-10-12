import { NextRequest, NextResponse } from 'next/server';
import { processDueDeliveries } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || !secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Compatibility route: all delivery work uses the canonical endpoint schema,
  // signer, SSRF checks, claim lease and retry policy in lib/webhooks.ts.
  return NextResponse.json(await processDueDeliveries());
}
