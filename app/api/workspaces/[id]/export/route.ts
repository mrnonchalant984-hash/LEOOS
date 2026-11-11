import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { validateIdeFiles } from '@/lib/ide-files';
import {
  createWorkspaceZipStream,
  workspaceFileDownloadFilename,
  selectWorkspaceExportFiles,
  workspaceDownloadFilename,
  WorkspaceExportError,
} from '@/lib/workspace-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const { data: project, error } = await adminSupabase().from('projects')
    .select('id,project_name,files')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Workspace could not be loaded for export.' }, { status: 503 });
  if (!project) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const files = project.files && typeof project.files === 'object' && !Array.isArray(project.files) ? project.files : {};
  if (!validateIdeFiles(files)) return NextResponse.json({ error: 'Workspace files failed export validation.' }, { status: 422 });

  try {
    const selectors = req.nextUrl.searchParams.getAll('path');
    const selected = selectWorkspaceExportFiles(files, selectors);
    const exactFile = selectors.length === 1 && Object.hasOwn(selected.files, selectors[0]);
    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-LeonardX-Omitted-Sensitive-Files': String(selected.omittedSensitiveFiles),
      'X-LeonardX-Exported-Files': String(Object.keys(selected.files).length),
    });

    if (exactFile) {
      const filePath = selectors[0];
      const filename = workspaceFileDownloadFilename(filePath);
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
      return new NextResponse(selected.files[filePath], { headers });
    }

    const zip = createWorkspaceZipStream(project.project_name || 'workspace', selected.files);
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="${workspaceDownloadFilename(project.project_name || 'workspace', 'zip')}"`);
    return new NextResponse(Readable.toWeb(zip as unknown as Readable) as ReadableStream<Uint8Array>, { headers });
  } catch (error) {
    if (error instanceof WorkspaceExportError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('Workspace export failed', { projectId: id, userId: auth.user.id });
    return NextResponse.json({ error: 'Workspace export failed. Try again after checking that its files are valid.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
