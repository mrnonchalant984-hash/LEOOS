import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const versions: Record<string,string|undefined> = { terms: process.env.MARKETPLACE_TERMS_VERSION, privacy: process.env.MARKETPLACE_PRIVACY_VERSION, marketing: process.env.MARKETPLACE_MARKETING_CONSENT_VERSION };
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage consent.' }, { status: 401 });
  return NextResponse.json({ versions: Object.fromEntries(Object.entries(versions).filter(([,version]) => Boolean(version))) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to manage consent.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { key?: unknown; version?: unknown; granted?: unknown } | null;
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!['terms','privacy','marketing'].includes(key) || typeof body?.version !== 'string' || typeof body.granted !== 'boolean') return NextResponse.json({ error: 'Invalid consent choice.' }, { status: 400 });
  if (!versions[key] || body.version !== versions[key]) return NextResponse.json({ error: 'The current reviewed policy version is not configured.' }, { status: 503 });
  const db = adminSupabase(); const { error } = await db.from('marketplace_consents').insert({ user_id:user.id, consent_key:key, version:body.version, granted:body.granted });
  if (error) return NextResponse.json({ error: 'Consent choice could not be recorded.' }, { status: 503 });
  if (key === 'marketing') {
    const { error: prefError } = await db.from('marketplace_notification_preferences').upsert({ user_id:user.id, marketing:body.granted, updated_at:new Date().toISOString() });
    if (prefError) return NextResponse.json({ error: 'Consent was recorded but notification preferences could not be updated.' }, { status: 503 });
  }
  return NextResponse.json({ recorded: true });
}
