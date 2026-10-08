import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { emitWebhookEvent } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { data: ep } = await adminSupabase().from('webhook_endpoints').select('id').eq('id', String(id)).eq('user_id', ctx.user.id).maybeSingle();
  if (!ep) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  const [result] = await emitWebhookEvent(ctx.user.id, 'webhook.test', { message: 'This is a test event from LEO OS.' }, ep.id);
  return NextResponse.json({ result: result || null });
}
