import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { verifyAndApplyPaystack, verifyPaystackTransaction } from '@/lib/payments';
import { notifyMarketplaceUser } from '@/lib/store-notifications';
import { matchesHostingRenewal } from '@/lib/payments-core';
import { promoteVercelDeployment } from '@/lib/vercel-hosting';
import { withOperationalMonitoring } from '@/lib/monitoring';
import { verifyAndConfirmDonation } from '@/lib/donations';

export const runtime = 'nodejs';

type PaystackEvent = {
  event?: unknown;
  data?: {
    id?: unknown;
    reference?: unknown;
    metadata?: unknown;
    customer?: { customer_code?: unknown };
    subscription_code?: unknown;
    subscription?: { subscription_code?: unknown };
    transaction_reference?: unknown;
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
  return withOperationalMonitoring(req, 'payment.webhook', async ({ reportFailure }) => {
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
  const reference = eventName.includes('refund') && typeof transaction.transaction_reference === 'string'
    ? transaction.transaction_reference
    : typeof transaction.reference === 'string' ? transaction.reference
      : typeof transaction.transaction_reference === 'string' ? transaction.transaction_reference : '';
  const db = adminSupabase();
  const providerEventId = typeof transaction.id === 'string' || typeof transaction.id === 'number'
    ? `${eventName}:${String(transaction.id)}`
    : reference ? `${eventName}:${reference}` : '';
  let providerEventColumnAvailable = true;

  try {
    if (providerEventId && ['charge.success', 'charge.failed', 'refund.processed', 'charge.refund'].includes(eventName)) {
      const { data: seen, error: seenError } = await db.from('payments').select('reference,status').eq('provider_event_id', providerEventId).maybeSingle();
      if (seenError?.code === '42703') providerEventColumnAvailable = false;
      else if (seenError) throw seenError;
      if (seen) return NextResponse.json({ received: true, idempotent: true });
    }

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
          restoreError = 'Deployment restoration failed.';
          reportFailure(error, 'vercel');
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

    if (eventName === 'charge.success' && metadata.type === 'donation' && reference) {
      if (metadata.donation_id !== reference) {
        return NextResponse.json({ error: 'Donation metadata does not match the transaction.' }, { status: 409 });
      }
      const donation = await verifyAndConfirmDonation(reference);
      return NextResponse.json({ received: true, idempotent: donation.alreadyApplied });
    }

    if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(eventName) && reference) {
      const { data: payout, error: payoutReadError } = await db.from('marketplace_seller_payouts')
        .select('id,seller_id,status').eq('reference', reference).maybeSingle();
      if (payoutReadError) throw payoutReadError;
      if (!payout) return NextResponse.json({ received: true });
      const payoutStatus = eventName === 'transfer.success' ? 'paid' : eventName === 'transfer.failed' ? 'failed' : 'reversed';
      if (payout.status === payoutStatus) return NextResponse.json({ received: true, idempotent: true });
      const allowedStatuses = eventName === 'transfer.reversed' ? ['initiating', 'pending', 'paid'] : ['initiating', 'pending'];
      const { data: updatedPayout, error: payoutUpdateError } = await db.from('marketplace_seller_payouts')
        .update({
          status: payoutStatus,
          failure_reason: payoutStatus === 'failed' ? 'Paystack transfer failed; review the Paystack dashboard before retrying.' : null,
          updated_at: new Date().toISOString(),
        }).eq('id', payout.id).in('status', allowedStatuses).select('id').maybeSingle();
      if (payoutUpdateError) throw payoutUpdateError;
      if (!updatedPayout) return NextResponse.json({ received: true, idempotent: true });
      try {
        await notifyMarketplaceUser({
          userId: payout.seller_id,
          kind: 'payout',
          title: payoutStatus === 'paid' ? 'Seller payout sent' : payoutStatus === 'failed' ? 'Seller payout needs review' : 'Seller payout reversed',
          body: payoutStatus === 'paid' ? 'Your LeoX Store payout has been sent to your saved bank account.' : 'Your LeoX Store payout requires review. Contact support before changing your payout account.',
          href: '/store/seller',
          preference: 'order_updates',
        });
      } catch (notificationError) {
        console.error('Seller payout notification failed:', notificationError instanceof Error ? notificationError.message : 'unknown error');
      }
      return NextResponse.json({ received: true });
    }

    if (eventName === 'charge.success' && metadata.type === 'marketplace_order' && reference) {
      const verified = await verifyPaystackTransaction(reference);
      const verifiedMetadata = getMetadata(verified.metadata);
      const orderId = typeof metadata.order_id === 'string' ? metadata.order_id : '';
      const userId = typeof metadata.user_id === 'string' ? metadata.user_id : '';
      if (verifiedMetadata.type !== 'marketplace_order' || verifiedMetadata.order_id !== orderId || verifiedMetadata.user_id !== userId || String(verified.currency).toUpperCase() !== 'NGN') {
        return NextResponse.json({ error: 'Verified marketplace payment metadata does not match.' }, { status: 409 });
      }
      const { data: order, error: orderError } = await db.from('marketplace_orders').select('id,buyer_id,total_kobo,payment_reference').eq('id', orderId).maybeSingle();
      if (orderError) throw orderError;
      if (!order || order.buyer_id !== userId || order.payment_reference !== reference || Number(verified.amount) !== Number(order.total_kobo)) {
        return NextResponse.json({ error: 'Verified marketplace payment does not match the order.' }, { status: 409 });
      }
      const { data: applied, error: applyError } = await db.rpc('apply_marketplace_payment', {
        p_reference: reference,
        p_amount_kobo: Number(verified.amount),
        p_paid_at: safePaidAt(verified.paid_at),
      });
      if (applyError) throw applyError;
      return NextResponse.json({ received: true, idempotent: applied === false });
    }

    if (eventName === 'charge.success' && metadata.user_id && reference) {
      const payment = await verifyAndApplyPaystack(reference);
      if (providerEventColumnAvailable && providerEventId) await db.from('payments').update({ provider_event_id: providerEventId }).eq('reference', reference);
      return NextResponse.json({ received: true, idempotent: payment.alreadyApplied });
    }

    if (eventName === 'charge.failed' && reference) {
      const failedUpdate: Record<string, string> = { status: 'failed', verified_at: new Date().toISOString() };
      if (providerEventColumnAvailable && providerEventId) failedUpdate.provider_event_id = providerEventId;
      const { error: paymentError } = await db.from('payments')
        .update(failedUpdate)
        .eq('reference', reference)
        .eq('status', 'pending');
      if (paymentError) throw paymentError;

      const { error: donationError } = await db.from('donations')
        .update({ payment_status: 'failed' })
        .eq('transaction_reference', reference)
        .eq('payment_status', 'pending');
      if (donationError) throw donationError;

      await db.from('hosting_renewal_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('reference', reference)
        .eq('status', 'pending');
    }

    if (eventName === 'refund.processed' || eventName === 'charge.refund') {
      if (reference) {
        const { data: marketplaceRefund, error: marketplaceRefundReadError } = await db.from('marketplace_refunds').select('id,order_id').eq('provider_reference', reference).maybeSingle();
        if (marketplaceRefundReadError) throw marketplaceRefundReadError;
        if (marketplaceRefund) {
          const refundStatus = eventName === 'refund.processed' ? 'processed' : 'pending';
          const { error: refundUpdateError } = await db.from('marketplace_refunds').update({ status: refundStatus, updated_at: new Date().toISOString() }).eq('id', marketplaceRefund.id).neq('status', refundStatus);
          if (refundUpdateError) throw refundUpdateError;
          if (refundStatus === 'processed') {
            const { error: orderUpdateError } = await db.from('marketplace_orders').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', marketplaceRefund.order_id).eq('status', 'refund_pending');
            if (orderUpdateError) throw orderUpdateError;
            await db.from('marketplace_order_events').insert({ order_id: marketplaceRefund.order_id, event_type: 'refund_processed' });
          }
        }
        const refundUpdate: Record<string, string> = { status: 'refunded', refunded_at: new Date().toISOString() };
        if (providerEventColumnAvailable && providerEventId) refundUpdate.provider_event_id = providerEventId;
        const { error: refundError } = await db.from('payments').update(refundUpdate).eq('reference', reference);
        if (refundError) throw refundError;
        const { error: donationRefundError } = await db.from('donations')
          .update({ payment_status: 'refunded' })
          .eq('transaction_reference', reference)
          .eq('payment_status', 'success');
        if (donationRefundError) throw donationRefundError;
      }
    }

    if (eventName === 'subscription.disable') {
      const subscriptionCode = typeof transaction.subscription_code === 'string'
        ? transaction.subscription_code
        : typeof transaction.subscription?.subscription_code === 'string' ? transaction.subscription.subscription_code : '';
      if (subscriptionCode) {
        const { error: subscriptionError } = await db.from('subscriptions').update({ status: 'cancelled', provider_status: 'disabled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('paystack_subscription_code', subscriptionCode).eq('status', 'active');
        if (subscriptionError && subscriptionError.code !== '42703') throw subscriptionError;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    reportFailure(error, 'paystack');
    return NextResponse.json({ error: 'Webhook processing failed. Paystack may retry this event.' }, { status: 500 });
  }
  });
}
