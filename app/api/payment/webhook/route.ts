import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { verifyAndApplyPaystack, verifyPaystackTransaction } from '@/lib/payments';
import { matchesHostingRenewal } from '@/lib/payments-core';
import { promoteVercelDeployment } from '@/lib/vercel-hosting';

export const runtime = 'nodejs';

type PaystackEvent = {
  event?: unknown;
  data?: {
    reference?: unknown;
    metadata?: unknown;
    customer?: { customer_code?: unknown };
  };
};

function getMetadata(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
}

function safePaidAt(value: unknown) {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (body.length > 1_000_000) return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });

  const signature = req.headers.get('x-paystack-signature') || '';
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Payment webhook is not configured.' }, { status: 503 });
  if (!/^[a-f\d]{128}$/i.test(signature)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });

  const expectedSignature = createHmac('sha512', secret).update(body).digest();
  const suppliedSignature = Buffer.from(signature, 'hex');
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(body) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  const eventName = typeof event.event === 'string' ? event.event : '';
  const transaction = event.data || {};
  const metadata = getMetadata(transaction.metadata);
  const reference = typeof transaction.reference === 'string' ? transaction.reference : '';
  const db = adminSupabase();

  try {
    if (eventName === 'charge.success' && metadata.type === 'hosting_renewal' && reference) {
      const hostingId = typeof metadata.hosting_id === 'string' ? metadata.hosting_id : '';
      const { data: renewal, error: renewalReadError } = await db.from('hosting_renewal_payments')
        .select('reference,hosting_subscription_id,amount_kobo,status')
        .eq('reference', reference)
        .maybeSingle();
      if (renewalReadError) throw renewalReadError;

      let registered = renewal;
      if (!registered) {
        // One-time compatibility for checkouts initiated before the additive ledger migration.
        const { data: legacyHosting, error: legacyReadError } = await db.from('hosting_subscriptions')
          .select('id,website_project_id,paystack_reference')
          .eq('id', hostingId)
          .maybeSingle();
        if (legacyReadError) throw legacyReadError;
        if (!legacyHosting || legacyHosting.paystack_reference !== reference) {
          return NextResponse.json({ error: 'Registered hosting renewal not found.' }, { status: 409 });
        }

        const expectedAmount = Number(process.env.HOSTING_RENEWAL_AMOUNT_KOBO);
        const verified = await verifyPaystackTransaction(reference);
        if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0
          || !matchesHostingRenewal(verified, {
            reference,
            hostingId,
            websiteProjectId: legacyHosting.website_project_id,
            amountKobo: expectedAmount,
          })) {
          return NextResponse.json({ error: 'Verified payment does not match the registered renewal.' }, { status: 409 });
        }

        const { error: legacyInsertError } = await db.from('hosting_renewal_payments').insert({
          reference,
          hosting_subscription_id: legacyHosting.id,
          amount_kobo: expectedAmount,
          currency: 'NGN',
          status: 'pending',
        });
        if (legacyInsertError && legacyInsertError.code !== '23505') throw legacyInsertError;
        const { data: recovered, error: recoveredError } = await db.from('hosting_renewal_payments')
          .select('reference,hosting_subscription_id,amount_kobo,status')
          .eq('reference', reference)
          .maybeSingle();
        if (recoveredError) throw recoveredError;
        registered = recovered;
      }

      if (!registered || registered.hosting_subscription_id !== hostingId) {
        return NextResponse.json({ error: 'Registered hosting renewal does not match.' }, { status: 409 });
      }
      if (registered.status === 'succeeded') return NextResponse.json({ received: true, idempotent: true });
      if (registered.status !== 'pending') return NextResponse.json({ error: 'Hosting renewal is not pending.' }, { status: 409 });

      const { data: hosting, error: hostingReadError } = await db.from('hosting_subscriptions')
        .select('id,website_project_id')
        .eq('id', hostingId)
        .maybeSingle();
      if (hostingReadError) throw hostingReadError;
      if (!hosting) return NextResponse.json({ error: 'Hosting subscription is unavailable.' }, { status: 409 });

      const verified = await verifyPaystackTransaction(reference);
      if (!matchesHostingRenewal(verified, {
        reference,
        hostingId,
        websiteProjectId: hosting.website_project_id,
        amountKobo: Number(registered.amount_kobo),
      })) {
        return NextResponse.json({ error: 'Verified payment does not match the registered renewal.' }, { status: 409 });
      }

      const { data: applied, error: applyError } = await db.rpc('apply_verified_hosting_renewal_payment', {
        p_reference: reference,
        p_paid_at: safePaidAt(verified.paid_at),
      });
      if (applyError) throw applyError;
      if (applied === false) return NextResponse.json({ received: true, idempotent: true });

      const { data: site, error: siteError } = await db.from('website_projects')
        .select('vercel_project_id,live_deployment_id')
        .eq('id', hosting.website_project_id)
        .maybeSingle();
      if (siteError) throw siteError;

      let restored = false;
      let restoreError = '';
      if (site?.vercel_project_id && site.live_deployment_id && process.env.LEO_HOSTING_ENFORCEMENT !== 'false') {
        try {
          await promoteVercelDeployment(String(site.vercel_project_id), String(site.live_deployment_id));
          restored = true;
          await db.from('website_projects').update({
            status: 'deployed',
            hosting_enforcement_status: 'active',
            suspended_deployment_id: null,
            updated_at: new Date().toISOString(),
          }).eq('id', hosting.website_project_id);
        } catch (error) {
          restoreError = error instanceof Error ? error.message.slice(0, 300) : 'Deployment restoration failed.';
        }
      }

      await db.from('deployment_events').insert({
        website_project_id: hosting.website_project_id,
        event_type: 'hosting_renewed',
        status: restored || !site?.live_deployment_id ? 'success' : 'error',
        message: restored
          ? 'Hosting renewal was verified and the previous production deployment was restored.'
          : restoreError || 'Hosting renewal was verified; deployment restoration requires follow-up.',
        metadata: { reference, restored, previousDeploymentId: site?.live_deployment_id || null },
      });

      return NextResponse.json({ received: true, restored });
    }

    if (eventName === 'charge.success' && metadata.user_id && reference) {
      const payment = await verifyAndApplyPaystack(reference);
      return NextResponse.json({ received: true, idempotent: payment.alreadyApplied });
    }

    if (eventName === 'charge.failed' && reference) {
      const { error: paymentError } = await db.from('payments')
        .update({ status: 'failed', verified_at: new Date().toISOString() })
        .eq('reference', reference)
        .eq('status', 'pending');
      if (paymentError) throw paymentError;

      await db.from('hosting_renewal_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('reference', reference)
        .eq('status', 'pending');
    }

    if (eventName === 'subscription.disable' && transaction.customer?.customer_code) {
      // Provider cancellations are intentionally not mapped to local access until a
      // corresponding provider subscription identifier is stored in the product model.
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Paystack webhook processing failed', {
      event: eventName || 'unknown',
      reference: reference || undefined,
      reason: error instanceof Error ? error.message : 'unknown error',
    });
    return NextResponse.json({ error: 'Webhook processing failed. Paystack may retry this event.' }, { status: 500 });
  }
}
