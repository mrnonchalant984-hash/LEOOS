import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const status = request.nextUrl.searchParams.get('status') ?? 'open';
  const { data, error } = await adminSupabase().from('marketplace_reports').select('id,reporter_id,product_id,conversation_id,reason,details,status,created_at').eq('status',status).order('created_at',{ascending:true}).limit(100);
  return error ? NextResponse.json({ error: 'Reports are unavailable.' }, { status: 503 }) : NextResponse.json({ reports: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { reportId?: unknown; status?: unknown; note?: unknown } | null;
  if (typeof body?.reportId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.reportId) || !['reviewing','resolved','dismissed'].includes(String(body.status)) || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000))) return NextResponse.json({ error: 'Invalid report review update.' }, { status: 400 });
  const db = adminSupabase(); const { data: report, error } = await db.from('marketplace_reports').update({ status: body.status }).eq('id',body.reportId).select('id,product_id,status').single();
  if (error || !report) return NextResponse.json({ error: 'Report could not be updated.' }, { status: 503 });
  await db.from('marketplace_moderation_audit').insert({ moderator_id: owner.user.id, product_id: report.product_id, report_id: report.id, action: String(body.status)==='dismissed'?'report_dismiss':'report_resolve', note: typeof body.note==='string'?body.note.trim():'' });
  return NextResponse.json({ report });
}
