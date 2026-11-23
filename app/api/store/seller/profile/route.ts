import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PROFILE_FIELDS = 'user_id,display_name,bio,country_code,is_verified,whatsapp_number,contact_email,location_text,delivery_details,updated_at';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage your storefront.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_sellers').select(PROFILE_FIELDS).eq('user_id', user.id).maybeSingle();
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
  const whatsappNumber = typeof body.whatsappNumber === 'string' ? body.whatsappNumber.trim() : '';
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const deliveryDetails = typeof body.deliveryDetails === 'string' ? body.deliveryDetails.trim() : '';
  if (displayName.length < 2 || displayName.length > 80 || bio.length > 2000 || !/^[A-Z]{2}$/.test(countryCode)) return NextResponse.json({ error: 'Enter a storefront name, a bio under 2,000 characters, and a two-letter country code.' }, { status: 400 });
  if (whatsappNumber && !/^\+[1-9][0-9]{7,14}$/.test(whatsappNumber)) return NextResponse.json({ error: 'Enter WhatsApp in international format, for example +2348012345678.' }, { status: 400 });
  if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return NextResponse.json({ error: 'Enter a valid contact email address.' }, { status: 400 });
  if (location.length > 180 || deliveryDetails.length > 1200) return NextResponse.json({ error: 'Location or delivery details are too long.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_sellers').upsert({ user_id: user.id, display_name: displayName, bio, country_code: countryCode, whatsapp_number: whatsappNumber || null, contact_email: contactEmail || null, location_text: location || null, delivery_details: deliveryDetails || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select(PROFILE_FIELDS).single();
  if (error) return NextResponse.json({ error: 'Storefront profile could not be saved.' }, { status: 503 });
  return NextResponse.json({ profile: data }, { headers: { 'Cache-Control': 'no-store' } });
}
