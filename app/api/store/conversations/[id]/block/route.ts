import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage this conversation.' }, { status: 401 });
  const { id } = await context.params; const body = await request.json().catch(() => null) as { blocked?: unknown } | null;
  if (typeof body?.blocked !== 'boolean') return NextResponse.json({ error: 'Choose block or unblock.' }, { status: 400 });
  const db = adminSupabase(); const { data: convo } = await db.from('marketplace_conversations').select('id,buyer_id,seller_id,blocked_by').eq('id', id).maybeSingle();
  if (!convo || ![convo.buyer_id, convo.seller_id].includes(user.id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  if (body.blocked && convo.blocked_by && convo.blocked_by !== user.id) return NextResponse.json({ error: 'This conversation is already blocked by the other participant.' }, { status: 403 });
  if (!body.blocked && convo.blocked_by && convo.blocked_by !== user.id) return NextResponse.json({ error: 'Only the person who blocked this conversation can unblock it.' }, { status: 403 });
  const { error } = await db.from('marketplace_conversations').update({ blocked_by: body.blocked ? user.id : null }).eq('id', id);
  return error ? NextResponse.json({ error: 'Block setting could not be updated.' }, { status: 503 }) : NextResponse.json({ blocked: body.blocked });
}
