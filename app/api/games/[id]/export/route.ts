import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { adminSupabase, getProfile } from '@/lib/auth';
import { validateIdeFiles } from '@/lib/ide-files';

export const runtime = 'nodejs';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const { data: project, error } = await adminSupabase().from('projects')
    .select('id,project_name,type,files').eq('id', id).eq('user_id', context.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Project could not be loaded.' }, { status: 503 });
  if (!project || project.type !== 'game') return NextResponse.json({ error: 'Browser game project not found.' }, { status: 404 });
  if (!validateIdeFiles(project.files) || typeof project.files['index.html'] !== 'string') {
    return NextResponse.json({ error: 'The project does not contain a valid browser-game entry point. Save index.html before exporting.' }, { status: 422 });
  }
  const zip = new JSZip();
  const folder = zip.folder(project.project_name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'browser-game')!;
  let omittedSensitiveFiles = 0;
  for (const [path, content] of Object.entries(project.files)) {
    if (path === 'leonardx.publication.json') continue;
    const unsafePath = /(^|\/)\.env(?:\.|$)|(^|\/)\.vercel(?:\/|$)|(^|\/)\.git(?:\/|$)|(^|\/)node_modules(?:\/|$)|(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)|private[-_]?key/i.test(path);
    const secretLike = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/.test(content);
    if (unsafePath || secretLike) { omittedSensitiveFiles += 1; continue; }
    folder.file(path, content);
  }
  const { data: assets, error: assetError } = await adminSupabase().from('media_assets').select('id,storage_path,mime_type,size_bytes,metadata').eq('user_id', context.user.id).eq('bucket','leo-files').contains('metadata',{project_id:id}).order('created_at',{ascending:false}).limit(100);
  if (assetError) return NextResponse.json({ error: 'Project assets could not be loaded for export.' }, { status: 503 });
  let exportedAssets = 0;
  for (const asset of assets || []) {
    const rawPath = typeof asset.metadata?.project_path === 'string' ? asset.metadata.project_path : '';
    const path = rawPath.replaceAll('\\','/');
    if (!/^assets\/[0-9a-f-]{36}\.(?:png|jpg|webp|mp3|ogg|wav)$/i.test(path)) { omittedSensitiveFiles += 1; continue; }
    const { data: blob, error: downloadError } = await adminSupabase().storage.from('leo-files').download(asset.storage_path);
    if (downloadError || !blob) return NextResponse.json({ error: 'A project asset could not be retrieved; the ZIP was not returned as complete.' }, { status: 503 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length || bytes.byteLength > 8 * 1024 * 1024) return NextResponse.json({ error: 'A project asset exceeded export size limits.' }, { status: 413 });
    folder.file(path, bytes); exportedAssets += 1;
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${(project.project_name || 'browser-game').replace(/[^a-z0-9._-]+/gi, '-')}.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-LeonardX-Omitted-Sensitive-Files': String(omittedSensitiveFiles),
      'X-LeonardX-Exported-Assets': String(exportedAssets),
    },
  });
}
