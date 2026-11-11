import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const moderator = await requireOwner(request);
  if (!moderator || !moderator.profile.twofa_verified) return NextResponse.json({ error: 'Owner 2FA access required.' }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Listing was not found.' }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown; note?: unknown } | null;
  const actions: Record<string, { status: string; audit: string }> = {
    approve: { status: 'active', audit: 'approve' }, reject: { status: 'rejected', audit: 'reject' },
    remove: { status: 'removed', audit: 'remove' }, restore: { status: 'pending_review', audit: 'restore' },
  };
  const selected = typeof body?.action === 'string' ? actions[body.action] : undefined;
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (!selected) return NextResponse.json({ error: 'Choose approve, reject, remove, or restore.' }, { status: 400 });
  if (selected.audit !== 'approve' && note.length < 3) return NextResponse.json({ error: 'Add a short moderation note.' }, { status: 400 });
  const db = adminSupabase();
  const { data, error } = await db.rpc('moderate_marketplace_product', { p_moderator_id: moderator.user.id, p_product_id: id, p_status: selected.status, p_action: selected.audit, p_note: note });
  if (error) {
    const notFound = error.message.toLowerCase().includes('listing not found');
    if (!notFound) console.error('Marketplace moderation failed:', error.message);
    return NextResponse.json({ error: notFound ? 'Listing was not found.' : 'Listing moderation failed.' }, { status: notFound ? 404 : 503 });
  }
  return NextResponse.json({ product: data }, { headers: { 'Cache-Control': 'no-store' } });
}

