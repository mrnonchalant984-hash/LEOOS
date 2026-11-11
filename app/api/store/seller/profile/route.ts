import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage your storefront.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_sellers').select('user_id,display_name,bio,country_code,is_verified,updated_at').eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Storefront profile is unavailable.' }, { status: 503 });
  return NextResponse.json({ profile: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage your storefront.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-seller-profile', 10, 3600); if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : '';
  if (displayName.length < 2 || displayName.length > 80 || bio.length > 2000 || !/^[A-Z]{2}$/.test(countryCode)) return NextResponse.json({ error: 'Enter a storefront name, a bio under 2,000 characters, and a two-letter country code.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_sellers').upsert({ user_id: user.id, display_name: displayName, bio, country_code: countryCode, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('user_id,display_name,bio,country_code,is_verified,updated_at').single();
  if (error) return NextResponse.json({ error: 'Storefront profile could not be saved.' }, { status: 503 });
  return NextResponse.json({ profile: data }, { headers: { 'Cache-Control': 'no-store' } });
}
