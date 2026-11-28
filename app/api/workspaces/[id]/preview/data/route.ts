import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { enforceDimensionRateLimit, enforceUserRateLimit } from '@/lib/rate-limit';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';
import { getCloudflarePreviewWorkerName } from '@/lib/cloudflare-preview/static-assets';

type RouteContext = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '300',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

function authorizedPreviewOrigin(origin: string | null, workerName: string) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const labels = url.hostname.toLowerCase().split('.');
    if (url.protocol !== 'https:' || url.origin !== origin || labels.length !== 4
      || labels[0] !== workerName.toLowerCase() || labels[1].length < 1
      || labels[2] !== 'workers' || labels[3] !== 'dev'
      || url.username || url.password || url.port) return null;
    return origin;
  } catch { return null; }
}

function readCapability(token: string, secret: string) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims?.aud !== 'braverton-preview-data' || typeof claims.sub !== 'string'
      || !UUID.test(claims.sub) || typeof claims.projectId !== 'string'
      || !UUID.test(claims.projectId) || !Array.isArray(claims.scope)
      || !claims.scope.includes('project_summary:read')
      || !Number.isInteger(claims.exp) || claims.exp <= now
      || !Number.isInteger(claims.iat) || claims.iat > now + 30
      || claims.exp - claims.iat > 300) return null;
    return claims as { sub: string; projectId: string; scope: string[]; exp: number };
  } catch { return null; }
}

export async function OPTIONS(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const config = getCloudflarePreviewConfig();
  if (!config.enabled || !config.projectName || !UUID.test(id)) return new NextResponse(null, { status: 404 });
  const origin = authorizedPreviewOrigin(req.headers.get('origin'), getCloudflarePreviewWorkerName(config.projectName, id));
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Workspace ID is invalid.' }, { status: 400 });
  const config = getCloudflarePreviewConfig();
  const secret = process.env.CRON_SECRET;
  if (!config.enabled || !config.projectName || !secret) return NextResponse.json({ error: 'Preview data access is not configured.' }, { status: 503 });
  const origin = authorizedPreviewOrigin(req.headers.get('origin'), getCloudflarePreviewWorkerName(config.projectName, id));
  if (!origin) return NextResponse.json({ error: 'Preview origin is not authorized.' }, { status: 403 });

  const authorization = req.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const claims = readCapability(token, secret);
  if (!claims || claims.projectId !== id) return NextResponse.json({ error: 'Preview data capability is invalid or expired.' }, { status: 401, headers: corsHeaders(origin) });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipLimit = await enforceDimensionRateLimit(req, 'preview-data-ip:' + ip, 'preview-data-read-ip', 120, 60);
  if (ipLimit) return NextResponse.json({ error: ipLimit.status === 429 ? 'Preview data rate limit exceeded.' : 'Preview data rate limiting is temporarily unavailable.' }, { status: ipLimit.status, headers: { ...corsHeaders(origin), 'Retry-After': ipLimit.headers.get('Retry-After') || '5' } });
  const userLimit = await enforceUserRateLimit(claims.sub, 'preview-data-read', 60, 60);
  if (userLimit) return NextResponse.json({ error: userLimit.status === 429 ? 'Preview data rate limit exceeded.' : 'Preview data rate limiting is temporarily unavailable.' }, { status: userLimit.status, headers: { ...corsHeaders(origin), 'Retry-After': userLimit.headers.get('Retry-After') || '5' } });

  const resource = new URL(req.url).searchParams.get('resource');
  if (resource !== 'project_summary') return NextResponse.json({ error: 'This preview data resource is not allowlisted.' }, { status: 403, headers: corsHeaders(origin) });

  const { data: project, error } = await adminSupabase().from('projects')
    .select('id,project_name,type')
    .eq('id', id)
    .eq('user_id', claims.sub)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Production data is temporarily unavailable.' }, { status: 503, headers: corsHeaders(origin) });
  if (!project) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: corsHeaders(origin) });

  console.info('[preview-data-read]', { projectId: id, userId: claims.sub, resource, origin, at: new Date().toISOString() });
  return NextResponse.json({ data: { project } }, { headers: corsHeaders(origin) });
}
