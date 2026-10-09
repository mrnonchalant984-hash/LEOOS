import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { attemptDelivery } from '@/lib/webhooks';
import { MAX_ATTEMPTS } from '@/lib/webhooks-core';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const endpointId = new URL(req.url).searchParams.get('endpoint_id');
  if (!endpointId) return NextResponse.json({ error: 'Missing endpoint_id' }, { status: 400 });
  const { data, error } = await adminSupabase().from('webhook_deliveries')
    .select('id,event,status,attempts,response_status,last_error,created_at,delivered_at,next_attempt_at')
    .eq('endpoint_id', endpointId).eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(25);
  if (error) return NextResponse.json({ error: 'Could not load deliveries' }, { status: 500 });
  return NextResponse.json({ deliveries: data || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { delivery_id } = await req.json().catch(() => ({}));
  if (!delivery_id) return NextResponse.json({ error: 'Missing delivery_id' }, { status: 400 });
  const db = adminSupabase();
  const { data: delivery } = await db.from('webhook_deliveries').select('id,endpoint_id,user_id,event,payload,attempts,status').eq('id', String(delivery_id)).eq('user_id', ctx.user.id).maybeSingle();
  if (!delivery) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
  if (delivery.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Retry limit reached for this delivery.' }, { status: 409 });
  if (delivery.status === 'succeeded') return NextResponse.json({ error: 'Successful deliveries cannot be retried.' }, { status: 409 });
  const { data: endpoint } = await db.from('webhook_endpoints').select('id,url,secret,active').eq('id', delivery.endpoint_id).eq('user_id', ctx.user.id).maybeSingle();
  if (!endpoint || !endpoint.active) return NextResponse.json({ error: 'Webhook endpoint is unavailable.' }, { status: 409 });
  const result = await attemptDelivery({ ...delivery, attempts: delivery.attempts }, endpoint);
  return NextResponse.json({ result });
}
