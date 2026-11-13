import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const status = request.nextUrl.searchParams.get('status') || 'pending';
  if (!['pending','approved','rejected','suspended'].includes(status)) return NextResponse.json({ error: 'Invalid supplier status.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_suppliers').select('user_id,business_name,country_code,verification_status,verification_note,created_at').eq('verification_status', status).order('created_at', { ascending: true }).limit(100);
  return error ? NextResponse.json({ error: 'Supplier review queue is unavailable.' }, { status: 503 }) : NextResponse.json({ suppliers: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { user_id?: unknown; status?: unknown; note?: unknown } | null;
  if (typeof body?.user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.user_id) || !['approved','rejected','suspended'].includes(String(body.status)) || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000))) return NextResponse.json({ error: 'Invalid supplier verification decision.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_suppliers').update({ verification_status: body.status, verification_note: typeof body.note === 'string' ? body.note.trim() : null, reviewed_by: owner.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', body.user_id).select('user_id,business_name,verification_status,verification_note,reviewed_at').single();
  return error ? NextResponse.json({ error: 'Supplier verification could not be updated.' }, { status: 503 }) : NextResponse.json({ supplier: data });
}
