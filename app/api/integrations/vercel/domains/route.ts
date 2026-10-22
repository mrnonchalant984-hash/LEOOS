import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { openConnectionConfig } from '@/lib/integrations/customer-connections';
import { isValidCustomDomain, isValidVercelProjectId } from '@/lib/integrations/domain-validation';

export const runtime = 'nodejs';
const VERCEL_API = 'https://api.vercel.com';
async function connection(userId: string) {
  const { data, error } = await adminSupabase().from('user_integrations').select('credential_ciphertext')
    .eq('user_id', userId).eq('provider', 'vercel').eq('status', 'verified').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new Error('Connect and verify your own Vercel account in Integrations first.');
  const config = openConnectionConfig(data.credential_ciphertext);
  if (!config.token) throw new Error('The connected Vercel credential is incomplete.');
  return config.token;
}
async function callVercel(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${VERCEL_API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Vercel API returned HTTP ${response.status}.`);
  return data as Record<string, unknown>;
}
export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!isValidVercelProjectId(projectId)) return NextResponse.json({ error: 'A valid Vercel projectId is required.' }, { status: 400 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-vercel-domain', 30, 60); if (limited) return limited;
  try {
    const token = await connection(ctx.user.id);
    // First prove the project is visible to this user's own Vercel token.
    const project = await callVercel(token, `/v9/projects/${encodeURIComponent(projectId)}`);
    const result = await callVercel(token, `/v9/projects/${encodeURIComponent(projectId)}/domains`);
    return NextResponse.json({ project: { id: project.id, name: project.name }, domains: result.domains || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load project domains.' }, { status: 502 }); }
}
export async function POST(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-vercel-domain', 10, 60); if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!isValidVercelProjectId(body?.projectId) || !isValidCustomDomain(body?.domain)) return NextResponse.json({ error: 'Provide a valid Vercel project ID and domain name without a URL path.' }, { status: 400 });
  try {
    const token = await connection(ctx.user.id);
    const projectId = encodeURIComponent(body.projectId);
    const project = await callVercel(token, `/v9/projects/${projectId}`);
    const result = await callVercel(token, `/v10/projects/${projectId}/domains`, { method: 'POST', body: JSON.stringify({ name: body.domain.toLowerCase().replace(/\.$/, '') }) });
    return NextResponse.json({ ok: true, project: { id: project.id, name: project.name }, domain: result, note: 'Domain registration was requested. Check returned verification/DNS requirements before treating it as live.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Domain could not be added.' }, { status: 502 }); }
}
export async function DELETE(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-vercel-domain', 10, 60); if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!isValidVercelProjectId(body?.projectId) || !isValidCustomDomain(body?.domain)) return NextResponse.json({ error: 'Provide a valid Vercel project ID and domain name.' }, { status: 400 });
  try {
    const token = await connection(ctx.user.id);
    const projectId = encodeURIComponent(body.projectId); const domain = encodeURIComponent(body.domain.toLowerCase().replace(/\.$/, ''));
    await callVercel(token, `/v9/projects/${projectId}`);
    await callVercel(token, `/v9/projects/${projectId}/domains/${domain}`, { method: 'DELETE' });
    return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Domain could not be removed.' }, { status: 502 }); }
}
