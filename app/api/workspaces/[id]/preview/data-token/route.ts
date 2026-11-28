import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';

type RouteContext = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: RouteContext) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(context.user.id, 'preview-data-capability', 10, 60);
  if (limited) return limited;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Workspace ID is invalid.' }, { status: 400 });
  const config = getCloudflarePreviewConfig();
  const signingSecret = process.env.CRON_SECRET;
  if (!config.enabled || !config.projectName || !signingSecret) {
    return NextResponse.json({ error: 'Preview data access is not configured.' }, { status: 503 });
  }

  const { data: project, error } = await adminSupabase().from('projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Workspace ownership could not be verified.' }, { status: 503 });
  if (!project) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    aud: 'braverton-preview-data',
    sub: context.user.id,
    projectId: id,
    scope: ['project_summary:read'],
    iat: now,
    exp: now + 300,
  })).toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(payload).digest('base64url');
  return NextResponse.json({
    token: payload + '.' + signature,
    expiresInSeconds: 300,
    scope: ['project_summary:read'],
  }, { headers: { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' } });
}
