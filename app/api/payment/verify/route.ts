import { NextRequest, NextResponse } from 'next/server';
import { verifyAndApplyPaystack } from '@/lib/payments';
import { withOperationalMonitoring } from '@/lib/monitoring';
import { isExpectedPaymentRejection } from '@/lib/monitoring-utils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return withOperationalMonitoring(req, 'payment.verify', async ({ reportFailure, markRejected }) => {
    try {
      const body = await req.json().catch(() => ({}));
      const reference = typeof body.reference === 'string' ? body.reference : '';
      if (!reference || !process.env.PAYSTACK_SECRET_KEY) {
        return NextResponse.json({ error: 'Missing payment configuration/reference.' }, { status: 400 });
      }

      const result = await verifyAndApplyPaystack(reference);
      return NextResponse.json({ ok: true, alreadyApplied: result.alreadyApplied });
    } catch (error) {
      if (isExpectedPaymentRejection(error)) markRejected();
      else reportFailure(error, 'paystack');
      return NextResponse.json({ error: 'Payment verification failed.' }, { status: 500 });
    }
  });
}
