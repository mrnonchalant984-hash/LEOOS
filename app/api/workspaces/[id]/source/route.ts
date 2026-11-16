import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { deleteWorkspaceFile, downloadWorkspaceArchive, getWorkspaceManifest, importWorkspaceZip, readWorkspaceTextFile, WorkspaceSourceError, writeWorkspaceTextFile, WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES } from '@/lib/workspace-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const jsonError = (error: unknown) => error instanceof WorkspaceSourceError
  ? NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  : NextResponse.json({ error: 'Project workspace operation failed.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest, { params }: Context) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  try {
    if (req.nextUrl.searchParams.get('download') === '1') {
      const archive = await downloadWorkspaceArchive(auth.user.id, id);
      return new NextResponse(archive, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="leonardx-workspace.zip"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const path = req.nextUrl.searchParams.get('path');
    const data = path ? await readWorkspaceTextFile(auth.user.id, id, path) : await getWorkspaceManifest(auth.user.id, id);
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function POST(req: NextRequest, { params }: Context) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'project-workspace-import', 5, 60);
  if (limited) return limited;
  const { id } = await params;
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES + 128 * 1024) return NextResponse.json({ error: 'ZIP upload exceeds 25 MB.' }, { status: 413 });
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a project file or ZIP archive.' }, { status: 400 });
    if (file.size < 1 || file.size > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) return NextResponse.json({ error: 'Project uploads must be between 1 byte and 25 MB.' }, { status: 413 });
    let bytes: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
    if (!file.name.toLowerCase().endsWith('.zip')) {
      const archive = new JSZip();
      archive.file(file.name, bytes);
      bytes = await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 5 } });
    }
    const result = await importWorkspaceZip(auth.user.id, id, bytes);
    return NextResponse.json({ data: result }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function PUT(req: NextRequest, { params }: Context) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'A valid file update is required.' }, { status: 400 });
  try {
    const data = await writeWorkspaceTextFile(auth.user.id, id, body.path, body.content, body.revision);
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const data = await deleteWorkspaceFile(auth.user.id, id, body?.path, body?.revision);
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}
