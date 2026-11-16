import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { importWorkspaceZip, WorkspaceSourceError, WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES } from '@/lib/workspace-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

function parseRepository(value: unknown) {
  if (typeof value !== 'string' || value.length > 300) throw new WorkspaceSourceError('Enter a GitHub repository URL or owner/repository.', 400);
  const match = value.trim().match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/i);
  if (!match || match[1] === '.' || match[2] === '.' || match[2].endsWith('.git')) throw new WorkspaceSourceError('Use a GitHub repository URL such as https://github.com/owner/repository.', 400);
  return { owner: match[1], repository: match[2] };
}

function headers() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LeonardX-Workspace-Importer',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function githubJson(url: string) {
  const response = await fetch(url, { headers: headers(), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) throw new WorkspaceSourceError('Repository or branch not found. Private repositories require a server-configured GitHub token.', 404);
    if (response.status === 403 || response.status === 429) throw new WorkspaceSourceError('GitHub rate limit or repository access prevented this request.', 429);
    throw new WorkspaceSourceError('GitHub repository metadata could not be loaded.', 502);
  }
  return result;
}

async function resolveRepository(owner: string, repository: string) {
  const metadata = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`);
  if (metadata?.private && !process.env.GITHUB_TOKEN) throw new WorkspaceSourceError('Private repositories require a server-configured GitHub token.', 403);
  if (typeof metadata?.default_branch !== 'string') throw new WorkspaceSourceError('GitHub did not return a default branch.', 502);
  return metadata as { default_branch: string; full_name: string; private: boolean };
}

function jsonError(error: unknown) {
  return error instanceof WorkspaceSourceError
    ? NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: 'GitHub project import failed.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'project-github-import', 20, 60);
  if (limited) return limited;
  try {
    const { owner, repository } = parseRepository(request.nextUrl.searchParams.get('repository'));
    const metadata = await resolveRepository(owner, repository);
    const branches = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches?per_page=50`);
    const branchNames = Array.isArray(branches) ? branches.map((item: any) => item?.name).filter((name: unknown): name is string => typeof name === 'string') : [];
    return NextResponse.json({
      repository: metadata.full_name,
      private: metadata.private,
      default_branch: metadata.default_branch,
      branches: branchNames.includes(metadata.default_branch) ? branchNames : [metadata.default_branch, ...branchNames],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'project-github-import', 5, 60);
  if (limited) return limited;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    const { owner, repository } = parseRepository(body?.repository);
    const metadata = await resolveRepository(owner, repository);
    const branch = typeof body?.branch === 'string' ? body.branch.trim() : metadata.default_branch;
    if (!branch || branch.length > 250 || /[\r\n]/.test(branch)) throw new WorkspaceSourceError('Choose a valid repository branch.', 400);

    const archiveResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zipball/${encodeURIComponent(branch)}`,
      { headers: headers(), cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(30000) },
    );
    if (archiveResponse.status !== 302 && archiveResponse.status !== 301) throw new WorkspaceSourceError('GitHub did not provide a downloadable archive for this branch.', 502);
    const location = archiveResponse.headers.get('location');
    if (!location) throw new WorkspaceSourceError('GitHub returned an invalid archive redirect.', 502);
    const archiveUrl = new URL(location);
    if (archiveUrl.protocol !== 'https:' || archiveUrl.hostname !== 'codeload.github.com') throw new WorkspaceSourceError('GitHub returned an untrusted archive host.', 502);
    const download = await fetch(archiveUrl, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!download.ok) throw new WorkspaceSourceError('The repository archive could not be downloaded.', 502);
    const declaredSize = Number(download.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) throw new WorkspaceSourceError('Repository ZIP exceeds the 25 MB import limit.', 413);
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length < 4 || bytes.length > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) throw new WorkspaceSourceError('Repository ZIP must be between 4 bytes and 25 MB.', 413);

    let source: JSZip;
    try { source = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false }); }
    catch { throw new WorkspaceSourceError('GitHub returned an invalid ZIP archive.', 422); }
    const entries = Object.values(source.files).filter((entry: any) => !entry.dir) as any[];
    const roots = entries.map(entry => entry.name.split('/')[0]).filter(Boolean);
    const wrapper = roots.length && roots.every(root => root === roots[0]) ? roots[0] : '';
    const clean = new JSZip();
    let imported = 0;
    for (const entry of entries) {
      const path = wrapper ? entry.name.slice(wrapper.length).replace(/^\//, '') : entry.name;
      if (!path || path.split('/').some((part: string) => ['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', '.vercel'].includes(part))) continue;
      if (entry.unsafeOriginalName) throw new WorkspaceSourceError('The GitHub archive contains an unsafe file path.', 422);
      if (entry.unixPermissions && ((Number(entry.unixPermissions) & 0o170000) === 0o120000)) throw new WorkspaceSourceError('Symbolic links are not permitted in imported projects.', 422);
      clean.file(path, await entry.async('nodebuffer'));
      imported += 1;
      if (imported > 1500) throw new WorkspaceSourceError('Repository contains more than 1,500 importable files.', 413);
    }
    if (!imported) throw new WorkspaceSourceError('No importable project files were found in this branch.', 422);
    const archive = await clean.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 5 } });
    const result = await importWorkspaceZip(auth.user.id, id, archive);
    return NextResponse.json({ data: result, source: 'github', repository: metadata.full_name, branch }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}
