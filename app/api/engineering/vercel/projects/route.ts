import { NextRequest, NextResponse } from 'next/server';
import { getProfile, isPlatformOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getVercelProject, listVercelProjects } from '@/lib/vercel-hosting';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isPlatformOwner(auth.profile)) {
    return NextResponse.json({ error: 'Owner access required for Vercel project discovery.' }, { status: 403 });
  }
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-vercel-projects', 20, 60);
  if (limited) return limited;

  if (!process.env.VERCEL_TOKEN?.trim()) {
    return NextResponse.json({
      ok: false,
      error: 'VERCEL_TOKEN is not configured. Configure it through the secure configuration panel or Vercel project settings.',
      projects: [],
      manualRoute: 'https://vercel.com/dashboard',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const projectId = request.nextUrl.searchParams.get('projectId');
  try {
    if (projectId) {
      const project = await getVercelProject(projectId);
      return NextResponse.json({
        ok: true,
        project,
        note: 'Select deployments by stable project id. Repository association is reported from Vercel metadata when present.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const projects = await listVercelProjects(30);
    return NextResponse.json({
      ok: true,
      projects,
      note: 'Use the project id field for configuration and deployment. Do not deploy by ambiguous name alone.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'Vercel projects could not be listed. Check the token and team scope.',
      projects: [],
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
