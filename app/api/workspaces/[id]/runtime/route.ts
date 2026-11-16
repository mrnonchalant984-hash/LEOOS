import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { downloadWorkspaceArchive, getWorkspaceManifest, WorkspaceSourceError } from '@/lib/workspace-source';
import { queueGitHubRuntimeJob } from '@/lib/runtime/github-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const allowed = new Set(['inspect', 'install', 'test', 'typecheck', 'lint', 'build', 'git_status', 'git_diff']);

export async function POST(req: NextRequest, { params }: Context) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Cross-origin workspace execution is not permitted.' }, { status: 403 });
  const limited = await enforceUserRateLimit(auth.user.id, 'workspace-runtime', 8, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.operation !== 'string' || !allowed.has(body.operation)) return NextResponse.json({ error: 'Unsupported workspace runtime operation.' }, { status: 400 });
  const { id } = await params;
  try {
    const manifest = await getWorkspaceManifest(auth.user.id, id);
    if (!manifest.files.length) return NextResponse.json({ error: 'Upload project source files before running a workspace operation.' }, { status: 409 });
    const archive = await downloadWorkspaceArchive(auth.user.id, id);
    if (!archive.length || archive.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'Workspace archive exceeds the 8 MB compressed GitHub Actions job limit.' }, { status: 413 });
    const job = await queueGitHubRuntimeJob({ userId: auth.user.id, projectId: id, kind: 'workspace', operation: body.operation, archive, metadata: { source_revision: manifest.revision } });
    return NextResponse.json({ data: { ...job, source_revision: manifest.revision, message: 'Workspace job queued on an ephemeral GitHub-hosted runner.' } }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof WorkspaceSourceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Workspace runtime could not be queued.' }, { status: 503 });
  }
}
