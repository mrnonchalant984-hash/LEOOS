import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to appeal a moderation decision.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { reportId?: unknown; details?: unknown } | null;
  if (typeof body?.reportId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.reportId) || typeof body.details !== 'string' || body.details.trim().length < 10 || body.details.length > 3000) return NextResponse.json({ error: 'Provide the report ID and appeal details.' }, { status: 400 });
  const db = adminSupabase(); const { data: report } = await db.from('marketplace_reports').select('id,reporter_id,product_id').eq('id',body.reportId).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Appeal not found.' }, { status: 404 });
  const { data: product } = report.product_id ? await db.from('marketplace_products').select('seller_id').eq('id',report.product_id).maybeSingle() : { data: null };
  if (report.reporter_id !== user.id && product?.seller_id !== user.id) return NextResponse.json({ error: 'Only a participant affected by this report can appeal it.' }, { status: 403 });
  const { data, error } = await db.from('marketplace_report_appeals').insert({ report_id: body.reportId, appellant_id: user.id, details: body.details.trim() }).select('id,status,created_at').single();
  return error ? NextResponse.json({ error: 'An appeal may already exist for this decision.' }, { status: 409 }) : NextResponse.json({ appeal: data }, { status: 201 });
}
