import { NextRequest, NextResponse } from 'next/server';
import { getProfile, isPlatformOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { buildEnvStatusReport, missingRequiredEnvNames, type EnvTarget } from '@/lib/env-config-catalog';
import { listVercelEnvMetadata } from '@/lib/secure-env-config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isPlatformOwner(auth.profile)) {
    return NextResponse.json({ error: 'Owner access required for environment configuration status.' }, { status: 403 });
  }
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-config-status', 30, 60);
  if (limited) return limited;

  const targetParam = request.nextUrl.searchParams.get('target') || 'production';
  const target = (['development', 'preview', 'production'].includes(targetParam)
    ? targetParam
    : 'production') as EnvTarget;
  const projectId = request.nextUrl.searchParams.get('vercelProjectId');

  const local = buildEnvStatusReport(target);
  const missingRequired = missingRequiredEnvNames(target);
  let vercel: Awaited<ReturnType<typeof listVercelEnvMetadata>> | null = null;
  if (projectId) {
    vercel = await listVercelEnvMetadata(projectId);
  }

  return NextResponse.json({
    target,
    variables: local,
    missingRequired,
    vercel: vercel
      ? {
        ok: vercel.ok,
        message: vercel.message,
        // Names/targets/types only — never values.
        variables: vercel.variables.map((item) => ({
          name: item.name,
          targets: item.targets,
          type: item.type,
          service: item.service,
        })),
      }
      : null,
    note: 'Secret values are never returned by this endpoint.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
