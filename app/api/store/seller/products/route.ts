import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view your listings.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_products').select('id,slug,title,description,category,price,currency,condition,country_code,region,city,image_urls,image_paths,stock_quantity,reserved_quantity,status,created_at,updated_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Listings are temporarily unavailable.' }, { status: 503 });
  return NextResponse.json({ products: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
