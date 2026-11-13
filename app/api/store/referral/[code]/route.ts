import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { enforceIpRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const limited = await enforceIpRateLimit(request, 'store-referral-click', 120, 3600);
  if (limited) return limited;
  const { code: rawCode } = await context.params;
  const code = rawCode.toUpperCase();
  if (!/^[A-F0-9]{14}$/.test(code)) return NextResponse.redirect(new URL('/store', request.url));
  const db = adminSupabase();
  const { data: affiliate } = await db.from('marketplace_affiliates').select('user_id').eq('referral_code', code).eq('status', 'approved').maybeSingle();
  if (!affiliate) return NextResponse.redirect(new URL('/store', request.url));
  const visitor = request.cookies.get('leo_ref_visitor')?.value || randomBytes(24).toString('hex');
  const visitorHash = createHash('sha256').update(visitor).digest('hex');
  const productSlug = request.nextUrl.searchParams.get('product')?.slice(0, 180) || '';
  let productId: string | null = null;
  let destination = new URL('/store', request.url);
  if (productSlug) {
    const { data: product } = await db.from('marketplace_products').select('id,slug').eq('slug', productSlug).eq('status', 'active').maybeSingle();
    if (product) { productId = product.id; destination = new URL(`/store/product/${encodeURIComponent(product.slug)}`, request.url); }
  }
  const { data: click } = await db.from('marketplace_affiliate_clicks').insert({ affiliate_id: affiliate.user_id, visitor_hash: visitorHash, product_id: productId }).select('id').single();
  const response = NextResponse.redirect(destination);
  response.cookies.set('leo_ref_visitor', visitor, { httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  if (click?.id) response.cookies.set('leo_affiliate_click', click.id, { httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  else response.cookies.set('leo_affiliate_click', '', { httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
