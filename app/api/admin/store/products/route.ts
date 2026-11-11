import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const moderator = await requireOwner(request);
  if (!moderator || !moderator.profile.twofa_verified) return NextResponse.json({ error: 'Owner 2FA access required.' }, { status: 403 });
  const status = request.nextUrl.searchParams.get('status') ?? 'pending_review';
  if (!['pending_review', 'active', 'rejected', 'removed'].includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_products').select('id,slug,title,description,category,price,currency,condition,country_code,region,city,seller_id,status,moderation_note,created_at').eq('status', status).order('created_at', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: 'Moderation queue is unavailable.' }, { status: 503 });
  return NextResponse.json({ products: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

