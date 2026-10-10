import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { validateIdeFiles } from '@/lib/ide-files';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const { data, error } = await adminSupabase().from('projects')
    .select('id,project_name,type,status,files')
    .eq('id', id).eq('user_id', context.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Workspace could not be loaded.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const files = data.files && typeof data.files === 'object' && !Array.isArray(data.files) ? data.files : {};
  return NextResponse.json({ data: { ...data, files } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 2_100_000) return NextResponse.json({ error: 'Workspace update exceeds the request size limit.' }, { status: 413 });
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('files' in body) || !validateIdeFiles(body.files)) {
    return NextResponse.json({ error: 'Files must be a valid, bounded path-to-text map.' }, { status: 400 });
  }
  const { data, error } = await adminSupabase().from('projects').update({ files: body.files })
    .eq('id', id).eq('user_id', context.user.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Workspace files could not be saved.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}
