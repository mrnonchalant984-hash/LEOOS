import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const status = request.nextUrl.searchParams.get('status') || 'pending';
  if (!['pending','approved','rejected','suspended'].includes(status)) return NextResponse.json({ error: 'Invalid affiliate status.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_affiliates').select('user_id,referral_code,status,commission_bps,created_at').eq('status', status).order('created_at', { ascending: true }).limit(100);
  return error ? NextResponse.json({ error: 'Affiliate review queue is unavailable.' }, { status: 503 }) : NextResponse.json({ affiliates: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { user_id?: unknown; status?: unknown; commission_bps?: unknown } | null;
  if (typeof body?.user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.user_id) || !['approved','rejected','suspended'].includes(String(body.status)) || (body.commission_bps !== undefined && (!Number.isInteger(body.commission_bps) || Number(body.commission_bps) < 0 || Number(body.commission_bps) > 3000))) return NextResponse.json({ error: 'Invalid affiliate decision.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_affiliates').update({ status: body.status, ...(body.commission_bps !== undefined ? { commission_bps: body.commission_bps } : {}), approved_by: body.status === 'approved' ? owner.user.id : null, approved_at: body.status === 'approved' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('user_id', body.user_id).select('user_id,status,commission_bps,approved_at').single();
  return error ? NextResponse.json({ error: 'Affiliate status could not be updated.' }, { status: 503 }) : NextResponse.json({ affiliate: data });
}
