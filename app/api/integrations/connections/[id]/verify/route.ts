import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import {
  getCustomerProviderCapabilities,
  isCustomerProvider,
  openConnectionConfig,
} from '@/lib/integrations/customer-connections';
import { verifyProviderCredential } from '@/lib/integrations/provider-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  }
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to verify this integration.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-integration-verify', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Connection was not found.' }, { status: 404 });
  }
  const db = adminSupabase();
  const { data: connection, error: readError } = await db.from('user_integrations')
    .select('id,provider,credential_ciphertext')
    .eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Connection could not be loaded.' }, { status: 503 });
  if (!connection || !isCustomerProvider(connection.provider)) return NextResponse.json({ error: 'Connection was not found.' }, { status: 404 });

  let verification;
  try {
    verification = await verifyProviderCredential(connection.provider, openConnectionConfig(connection.credential_ciphertext));
  } catch {
    verification = { status: 'verification_failed' as const, code: 'VERIFICATION_UNAVAILABLE', message: 'Provider verification could not be completed. Reconnect or try again.' };
  }
  const { data, error } = await db.from('user_integrations').update({
    status: verification.status,
    scopes: verification.scopes || [],
    last_verified_at: verification.status === 'verified' ? new Date().toISOString() : null,
    last_error_code: verification.code || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', ctx.user.id).select('id,provider,label,status,scopes,last_verified_at,last_error_code').maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Verification status could not be saved.' }, { status: 503 });
  return NextResponse.json({
    connection: {
      ...data,
      capabilities: getCustomerProviderCapabilities(data.provider, data.scopes || [], data.status === 'verified'),
    },
    verification: { status: verification.status, message: verification.message },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
