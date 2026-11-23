import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device and verified two-factor authentication is required.' }, { status: 403 });
  const { data, error } = await adminSupabase().from('marketplace_seller_verification_requests')
    .select('id,seller_id,business_name,country_code,details,evidence_url,evidence_notes,status,reviewer_note,created_at,updated_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Seller review queue is unavailable.' }, { status: 503 });
  const ids = (data ?? []).map(item => item.id);
  const { data: decisions, error: decisionError } = ids.length
    ? await adminSupabase().from('marketplace_seller_verification_decisions')
      .select('request_id,decision_source,outcome,risk_score,risk_signals,rationale,created_at')
      .in('request_id', ids).order('created_at', { ascending: false })
    : { data: [], error: null };
  if (decisionError) return NextResponse.json({ error: 'Seller review audit is unavailable.' }, { status: 503 });
  return NextResponse.json({ requests: data ?? [], decisions: decisions ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device and verified two-factor authentication is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { requestId?: unknown; decision?: unknown; note?: unknown } | null;
  if (typeof body?.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)
    || !['approved','rejected'].includes(String(body.decision))
    || typeof body.note !== 'string' || body.note.trim().length < 3 || body.note.length > 2000) {
    return NextResponse.json({ error: 'Provide a verification request, approve/reject decision, and review note.' }, { status: 400 });
  }
  const { data, error } = await adminSupabase().rpc('owner_review_marketplace_seller_verification', {
    p_request_id: body.requestId, p_reviewer_id: owner.user.id, p_decision: body.decision, p_note: body.note.trim(),
  });
  if (error) return NextResponse.json({ error: /not found/i.test(error.message) ? 'Verification request not found.' : 'Owner review could not be saved.' }, { status: 409 });
  try {
    await notifyMarketplaceUser({
      userId: data.seller_id, kind: 'seller_verification',
      title: body.decision === 'approved' ? 'Your Braverton seller application was approved' : 'Your Braverton seller application needs changes',
      body: body.decision === 'approved' ? 'Your seller tools are now unlocked.' : 'Your application was not approved. Review the note in your seller verification panel before applying again.',
      href: '/store/seller', preference: 'support_updates',
      idempotencyKey: `seller-owner-review:${body.requestId}:${String(body.decision)}`,
    });
  } catch (notificationError) {
    console.error('Owner seller review notification failed:', notificationError instanceof Error ? notificationError.message : 'unknown error');
  }
  return NextResponse.json({ decision: data });
}
