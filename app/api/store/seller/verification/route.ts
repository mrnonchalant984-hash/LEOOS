import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view verification.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_seller_verification_requests').select('id,business_name,country_code,details,status,reviewer_note,created_at,updated_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(20);
  return error ? NextResponse.json({ error: 'Verification requests are unavailable.' }, { status: 503 }) : NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to request seller verification.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { businessName?: unknown; countryCode?: unknown; details?: unknown } | null;
  if (typeof body?.businessName !== 'string' || body.businessName.trim().length < 2 || body.businessName.length > 120 || typeof body.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(body.countryCode) || (body.details !== undefined && (typeof body.details !== 'string' || body.details.length > 2000))) return NextResponse.json({ error: 'Provide business name, country code and optional verification context.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_seller_verification_requests').insert({ seller_id: user.id, business_name: body.businessName.trim(), country_code: body.countryCode.toUpperCase(), details: typeof body.details === 'string' ? body.details.trim() : '' }).select('id,status,created_at').single();
  return error ? NextResponse.json({ error: 'A request may already be under review.' }, { status: 409 }) : NextResponse.json({ request: data }, { status: 201 });
}
