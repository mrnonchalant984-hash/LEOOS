import { randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';

function matchesRenewalToken(hostingId: string, token: unknown) {
  const secret = process.env.CRON_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!secret || typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) return false;
  const expected = createHmac('sha256', secret).update(hostingId).digest();
  const supplied = Buffer.from(token, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function paymentCallbackUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured ? new URL(configured) : req.nextUrl;
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('A verified HTTPS site URL is required for checkout.');
  }
  return new URL('/payment/callback?type=hosting_renewal', base.origin).toString();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hostingId = typeof body?.hosting_id === 'string' ? body.hosting_id : '';
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(hostingId) || !matchesRenewalToken(hostingId, body?.token)) {
    return NextResponse.json({ error: 'Invalid renewal link.' }, { status: 403 });
  }
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: 'Hosting payments are not configured.' }, { status: 503 });
  }

  const amount = Number(process.env.HOSTING_RENEWAL_AMOUNT_KOBO);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Hosting renewal pricing is not configured.' }, { status: 503 });
  }

  const db = adminSupabase();
  const { data: hosting, error: hostingError } = await db.from('hosting_subscriptions')
    .select('id,website_project_id,client_email')
    .eq('id', hostingId)
    .maybeSingle();
  if (hostingError) return NextResponse.json({ error: 'Hosting renewal is temporarily unavailable.' }, { status: 503 });
  if (!hosting) return NextResponse.json({ error: 'Hosting subscription not found.' }, { status: 404 });

  const reference = `hosting_${randomUUID().replaceAll('-', '')}`;
  const { error: intentError } = await db.from('hosting_renewal_payments').insert({
    reference,
    hosting_subscription_id: hosting.id,
    amount_kobo: amount,
    currency: 'NGN',
    status: 'pending',
  });
  if (intentError) return NextResponse.json({ error: 'Renewal could not be registered. Please try again.' }, { status: 503 });

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: hosting.client_email,
        amount,
        reference,
        callback_url: paymentCallbackUrl(req),
        metadata: {
          type: 'hosting_renewal',
          hosting_id: hosting.id,
          website_project_id: hosting.website_project_id,
        },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.status || typeof result?.data?.authorization_url !== 'string') {
      await db.from('hosting_renewal_payments').update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('reference', reference).eq('status', 'pending');
      return NextResponse.json({ error: 'Paystack could not start the hosting renewal. Please try again.' }, { status: 502 });
    }

    return NextResponse.json({ authorization_url: result.data.authorization_url, reference }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    await db.from('hosting_renewal_payments').update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('reference', reference).eq('status', 'pending');
    if (error instanceof Error && error.message === 'A verified HTTPS site URL is required for checkout.') {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Hosting renewal could not be started. Please try again.' }, { status: 502 });
  }
}
