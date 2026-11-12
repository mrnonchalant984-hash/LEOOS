import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const tables = ['marketplace_disputes','marketplace_report_appeals','marketplace_seller_verification_requests','marketplace_support_tickets','marketplace_data_requests'] as const;
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const kind = request.nextUrl.searchParams.get('kind') as typeof tables[number] | null;
  if (!kind || !tables.includes(kind)) return NextResponse.json({ error: 'Choose a supported work queue.' }, { status: 400 });
  const defaultStatus = kind === 'marketplace_seller_verification_requests' ? 'pending' : 'open';
  const status = request.nextUrl.searchParams.get('status') ?? defaultStatus;
  const { data, error } = await adminSupabase().from(kind).select('*').eq('status',status).order('created_at',{ascending:true}).limit(100);
  return error ? NextResponse.json({ error: 'Work queue is unavailable.' }, { status: 503 }) : NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { kind?: unknown; id?: unknown; status?: unknown; note?: unknown } | null;
  const allowed: Record<string,string[]> = { marketplace_disputes:['reviewing','resolved','dismissed'], marketplace_report_appeals:['reviewing','accepted','rejected'], marketplace_seller_verification_requests:['approved','rejected'], marketplace_support_tickets:['working','resolved','closed'], marketplace_data_requests:['working','completed','declined'] };
  if (typeof body?.kind !== 'string' || !tables.includes(body.kind as typeof tables[number]) || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) || !allowed[body.kind]?.includes(String(body.status)) || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 5000))) return NextResponse.json({ error: 'Invalid work queue update.' }, { status: 400 });
  const update: Record<string,unknown> = { status: body.status, updated_at: new Date().toISOString() };
  if (body.kind === 'marketplace_disputes') { update.reviewed_by = owner.user.id; update.resolution = typeof body.note === 'string' ? body.note.trim() : null; }
  if (body.kind === 'marketplace_seller_verification_requests') { update.reviewer_id = owner.user.id; update.reviewer_note = typeof body.note === 'string' ? body.note.trim() : null; }
  if (body.kind === 'marketplace_support_tickets') update.staff_reply = typeof body.note === 'string' ? body.note.trim() : null;
  const db = adminSupabase();
  if (body.kind === 'marketplace_data_requests' && body.status === 'completed') {
    const { data: requestItem } = await db.from('marketplace_data_requests').select('request_type').eq('id',body.id).maybeSingle();
    if (requestItem?.request_type === 'deletion') return NextResponse.json({ error: 'Deletion cannot be marked complete until the approved retention and deletion procedure has been carried out.' }, { status: 409 });
  }
  const { data, error } = await db.from(body.kind).update(update).eq('id',body.id).select('*').single();
  if (error) return NextResponse.json({ error: 'Queue item could not be updated.' }, { status: 503 });
  if (body.kind === 'marketplace_seller_verification_requests' && body.status === 'approved' && data) {
    const { error: sellerError } = await db.from('marketplace_sellers').upsert({
      user_id: data.seller_id,
      display_name: String(data.business_name).trim().slice(0, 80),
      bio: '',
      country_code: data.country_code,
      is_verified: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (sellerError) {
      console.error('Approved seller profile could not be provisioned:', sellerError.message);
      return NextResponse.json({ error: 'Verification was approved, but seller access could not be enabled. Retry the approval.' }, { status: 503 });
    }
    const { error: verifyError } = await db.from('marketplace_sellers').update({ is_verified: true, updated_at: new Date().toISOString() }).eq('user_id', data.seller_id);
    if (verifyError) {
      console.error('Approved seller access could not be enabled:', verifyError.message);
      return NextResponse.json({ error: 'Verification was approved, but seller access could not be enabled. Retry the approval.' }, { status: 503 });
    }
  }
  return NextResponse.json({ item: data });
}
