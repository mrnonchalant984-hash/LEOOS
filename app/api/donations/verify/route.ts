import { NextRequest, NextResponse } from 'next/server';
import { verifyAndConfirmDonation } from '@/lib/donations';
import { enforceIpRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const limited = await enforceIpRateLimit(req, 'donation-verify', 20, 3600);
  if (limited) return limited;
  const body: unknown = await req.json().catch(() => null);
  const reference = body && typeof body === 'object' && 'reference' in body && typeof body.reference === 'string'
    ? body.reference
    : '';
  if (!/^don_[a-f0-9]{32}$/i.test(reference)) return NextResponse.json({ error: 'A valid donation reference is required.' }, { status: 400 });
  try {
    const result = await verifyAndConfirmDonation(reference);
    return NextResponse.json({ ok: true, alreadyApplied: result.alreadyApplied }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const expected = /not registered|does not match|could not be verified|not confirmed/i.test(message);
    if (!expected) console.error('Donation verification failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: expected ? 'Paystack has not confirmed this donation yet.' : 'Donation verification is temporarily unavailable.' }, {
      status: expected ? 409 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
