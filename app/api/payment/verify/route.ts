import { NextRequest, NextResponse } from 'next/server';
import { verifyAndApplyPaystack } from '@/lib/payments';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();
    if (!reference || !process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ error: 'Missing payment configuration/reference.' }, { status: 400 });
    const result = await verifyAndApplyPaystack(String(reference));
    return NextResponse.json({ ok: true, alreadyApplied: result.alreadyApplied });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Verification failed.' }, { status: 500 });
  }
}
