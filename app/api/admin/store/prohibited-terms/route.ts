import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const { data, error } = await adminSupabase().from('marketplace_prohibited_terms').select('id,term,category,active,created_at').order('term').limit(500);
  return error ? NextResponse.json({ error: 'Safety term list is unavailable.' }, { status: 503 }) : NextResponse.json({ terms: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { term?: unknown; category?: unknown } | null;
  if (typeof body?.term !== 'string' || body.term.trim().length < 2 || body.term.length > 100 || (body.category !== undefined && (typeof body.category !== 'string' || body.category.length > 80))) return NextResponse.json({ error: 'Provide a term and optional category.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_prohibited_terms').insert({ term: body.term.trim(), category: typeof body.category === 'string' ? body.category.trim() : 'review' }).select('id,term,category,active').single();
  return error ? NextResponse.json({ error: 'Term already exists or could not be saved.' }, { status: 409 }) : NextResponse.json({ term: data }, { status: 201 });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: unknown; active?: unknown } | null;
  if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) || typeof body.active !== 'boolean') return NextResponse.json({ error: 'Invalid term update.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_prohibited_terms').update({ active: body.active }).eq('id',body.id).select('id,term,active').single();
  return error ? NextResponse.json({ error: 'Term could not be updated.' }, { status: 503 }) : NextResponse.json({ term: data });
}
