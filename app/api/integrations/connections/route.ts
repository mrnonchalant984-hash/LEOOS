import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { isCustomerProvider, sealConnectionConfig, validateConnectionConfig, verifyCustomerConnection } from '@/lib/integrations/customer-connections';

export const runtime = 'nodejs';
const safeSelect = 'id,provider,label,status,scopes,metadata,last_verified_at,last_error_code,created_at,updated_at';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view your connections.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('user_integrations').select(safeSelect)
    .eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Connections could not be loaded. Apply the user integrations migration first.' }, { status: 503 });
  return NextResponse.json({ connections: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to connect a service.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-integration-write', 10, 60);
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!isCustomerProvider(body?.provider)) return NextResponse.json({ error: 'Choose a supported provider.' }, { status: 400 });
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 100) : '';
  if (!label) return NextResponse.json({ error: 'A connection label is required.' }, { status: 400 });
  let config;
  try { config = validateConnectionConfig(body.provider, body.config); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid connection settings.' }, { status: 400 }); }
  let verification: { status: 'configured' | 'verified' | 'verification_failed'; message: string; code?: string };
  try { verification = await verifyCustomerConnection(body.provider, config); }
  catch { verification = { status: 'verification_failed', code: 'PROVIDER_UNAVAILABLE', message: 'Provider verification could not be completed. Check connectivity and retry.' }; }
  let ciphertext: string;
  try { ciphertext = sealConnectionConfig(config); }
  catch { return NextResponse.json({ error: 'Credential encryption is unavailable. Configure MCP_CREDENTIAL_ENCRYPTION_KEY before saving customer credentials.' }, { status: 503 }); }
  const { data, error } = await adminSupabase().from('user_integrations').insert({
    user_id: ctx.user.id, provider: body.provider, label, credential_ciphertext: ciphertext,
    status: verification.status, scopes: Array.isArray(body.scopes) ? body.scopes.filter((v: unknown) => typeof v === 'string').slice(0, 40) : [],
    metadata: {}, last_verified_at: verification.status === 'verified' ? new Date().toISOString() : null,
    last_error_code: verification.code || null,
  }).select(safeSelect).single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A connection with this provider and label already exists.' }, { status: 409 });
    return NextResponse.json({ error: 'Connection could not be saved. Confirm the user integrations migration is applied.' }, { status: 503 });
  }
  return NextResponse.json({ connection: data, verification: { status: verification.status, message: verification.message } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
