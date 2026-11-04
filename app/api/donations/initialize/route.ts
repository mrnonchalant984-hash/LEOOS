import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { parseDonationAmount } from '@/lib/donations';
import { enforceIpRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function donationCallbackUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured ? new URL(configured) : req.nextUrl;
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('A verified HTTPS site URL is required for donation checkout.');
  }
  return new URL('/donate/success', base.origin).toString();
}

export async function POST(req: NextRequest) {
  const limited = await enforceIpRateLimit(req, 'donation-checkout', 5, 3600);
  if (limited) return limited;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Donations are temporarily unavailable.' }, { status: 503 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Enter donation details.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const amountKobo = parseDonationAmount(input.amount);
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 100) : '';
  if (!amountKobo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email and a whole-naira donation between ₦100 and ₦5,000,000.' }, { status: 400 });
  }

  const reference = `don_${randomUUID().replaceAll('-', '')}`;
  try {
    const context = await getProfile(req);
    const db = adminSupabase();
    const { error: insertError } = await db.from('donations').insert({
      user_id: context?.user.id || null,
      supporter_name: name || null,
      email,
      amount: amountKobo / 100,
      amount_kobo: amountKobo,
      currency: 'NGN',
      payment_provider: 'paystack',
      transaction_reference: reference,
      payment_status: 'pending',
    });
    if (insertError) {
      console.error('Donation record could not be registered', { error: insertError.message });
      return NextResponse.json({ error: 'Donation checkout could not be registered.' }, { status: 503 });
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        currency: 'NGN',
        callback_url: donationCallbackUrl(req),
        metadata: { type: 'donation', donation_id: reference },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.status || typeof result?.data?.authorization_url !== 'string') {
      const { error: updateError } = await db.from('donations').update({ payment_status: 'failed' })
        .eq('transaction_reference', reference).eq('payment_status', 'pending');
      if (updateError) console.error('Failed donation initialization state could not be saved', { reference, error: updateError.message });
      return NextResponse.json({ error: 'Paystack could not start the donation checkout.' }, { status: 502 });
    }
    return NextResponse.json({ authorizationUrl: result.data.authorization_url, reference }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    try {
      const { error: updateError } = await adminSupabase().from('donations').update({ payment_status: 'failed' })
        .eq('transaction_reference', reference).eq('payment_status', 'pending');
      if (updateError) console.error('Failed donation initialization state could not be saved', { reference, error: updateError.message });
    } catch (updateFailure) {
      console.error('Failed donation initialization state could not be saved', {
        reference,
        error: updateFailure instanceof Error ? updateFailure.message : 'unknown',
      });
    }
    if (error instanceof Error && error.message === 'A verified HTTPS site URL is required for donation checkout.') {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Donation checkout initialization failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Donation checkout could not be initialized.' }, { status: 502 });
  }
}
