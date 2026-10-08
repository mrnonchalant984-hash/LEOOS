import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { generateWebhookSecret, parseEvents, validateEndpointUrl, WEBHOOK_EVENTS } from '@/lib/webhooks-core';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { data, error } = await adminSupabase().from('webhook_endpoints') // secret is never selected
    .select('id,url,description,events,active,created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load webhooks' }, { status: 500 });
  return NextResponse.json({ endpoints: data || [], availableEvents: WEBHOOK_EVENTS });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const check = validateEndpointUrl(String(body.url || '').trim());
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
  const events = parseEvents(body.events);
  const db = adminSupabase();
  const { count } = await db.from('webhook_endpoints').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: 'Limit of 5 webhook endpoints. Delete one first.' }, { status: 400 });
  const secret = generateWebhookSecret();
  const { data, error } = await db.from('webhook_endpoints').insert({
    user_id: ctx.user.id, url: check.url.toString(), description: String(body.description || '').slice(0, 120) || null,
    events: events.length ? events : [...WEBHOOK_EVENTS], secret,
  }).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create webhook' }, { status: 500 });
  return NextResponse.json({ id: data.id, secret, notice: 'Copy this signing secret now. It will not be shown again.' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { data, error } = await adminSupabase().from('webhook_endpoints').delete().eq('id', id).eq('user_id', ctx.user.id).select('id');
  if (error) return NextResponse.json({ error: 'Could not delete webhook' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
