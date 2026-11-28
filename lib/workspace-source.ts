import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { normalizeIdePath } from '@/lib/ide-files';

export const WORKSPACE_SOURCE_BUCKET = 'leo-files';
export const WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const WORKSPACE_SOURCE_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const WORKSPACE_SOURCE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const WORKSPACE_SOURCE_MAX_FILES = 1500;
const EXCLUDED = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', '.vercel']);
const SENSITIVE = /(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx|keystore))$/i;
const TEXT_EXT = /(^|\/)(Dockerfile|Makefile|Procfile|\.gitignore|\.gitattributes|\.editorconfig)$|\.(txt|md|mdx|json|jsonc|jsonl|ya?ml|toml|ini|conf|config|js|jsx|ts|tsx|mjs|cjs|css|scss|sass|less|html?|svg|xml|sh|bash|zsh|py|ipynb|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|fs|php|rb|sql|graphql|gql|prisma|dockerfile|gitignore|gitattributes|editorconfig|lock)$/i;

export type SourceEntry = { path: string; size: number; kind: 'text' | 'binary'; updatedAt?: string };
export type SourceManifest = { projectId: string; revision: number; files: SourceEntry[]; totalBytes: number; updatedAt: string | null };

export class WorkspaceSourceError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'WorkspaceSourceError'; }
}

export function safeSourcePath(value: unknown): string {
  const path = normalizeIdePath(value);
  if (!path || SENSITIVE.test(path) || path.split('/').some(part => EXCLUDED.has(part))) throw new WorkspaceSourceError('This file path is not allowed in a project workspace.', 400);
  return path;
}

async function loadProject(userId: string, projectId: string) {
  const db = adminSupabase();
  const { data, error } = await db.from('projects').select('id,project_name,user_id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw new WorkspaceSourceError('Project access could not be verified.', 503);
  if (!data) throw new WorkspaceSourceError('Project not found.', 404);
  return data;
}

async function ensureRecord(userId: string, projectId: string) {
  const db = adminSupabase();
  const { data, error } = await db.from('project_workspace_sources').select('*').eq('project_id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw new WorkspaceSourceError('Workspace storage metadata is unavailable. Apply the project workspace migration.', 503);
  if (data) return data;
  const { data: created, error: insertError } = await db.from('project_workspace_sources').insert({ project_id: projectId, user_id: userId, revision: 0, storage_path: null, file_count: 0, total_bytes: 0 }).select('*').single();
  if (insertError) {
    const { data: raced, error: readError } = await db.from('project_workspace_sources').select('*').eq('project_id', projectId).eq('user_id', userId).maybeSingle();
    if (readError || !raced) throw new WorkspaceSourceError('Workspace metadata could not be initialized.', 503);
    return raced;
  }
  return created;
}

async function readArchive(storagePath: string | null): Promise<JSZip> {
  if (!storagePath) return new JSZip();
  const { data, error } = await adminSupabase().storage.from(WORKSPACE_SOURCE_BUCKET).download(storagePath);
  if (error || !data) throw new WorkspaceSourceError('The saved project archive could not be loaded.', 503);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) throw new WorkspaceSourceError('The saved project archive exceeds the supported size.', 413);
  try { return await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false }); }
  catch { throw new WorkspaceSourceError('The saved project archive is invalid or corrupted.', 422); }
}

async function persistArchive(userId: string, projectId: string, current: any, zip: JSZip) {
  const files = Object.values(zip.files).filter((f: any) => !f.dir);
  if (files.length > WORKSPACE_SOURCE_MAX_FILES) throw new WorkspaceSourceError(`A workspace can contain at most ${WORKSPACE_SOURCE_MAX_FILES} files.`, 413);
  let total = 0;
  for (const file of files as any[]) {
    const path = safeSourcePath(file.name);
    const bytes = await file.async('nodebuffer');
    if (bytes.length > WORKSPACE_SOURCE_MAX_FILE_BYTES) throw new WorkspaceSourceError(`${path} exceeds the 5 MB per-file limit.`, 413);
    total += bytes.length;
    if (total > WORKSPACE_SOURCE_MAX_TOTAL_BYTES) throw new WorkspaceSourceError('The workspace exceeds the 50 MB uncompressed limit.', 413);
  }
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 5 }, platform: 'UNIX' });
  if (archive.length > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) throw new WorkspaceSourceError('The compressed workspace exceeds the 25 MB storage limit.', 413);
  const nextRevision = Number(current.revision || 0) + 1;
  const path = `project-workspaces/${userId}/${projectId}/${nextRevision}-${randomUUID()}.zip`;
  const upload = await adminSupabase().storage.from(WORKSPACE_SOURCE_BUCKET).upload(path, archive, { contentType: 'application/zip', upsert: false, cacheControl: 'private, no-store' });
  if (upload.error) throw new WorkspaceSourceError('The project archive could not be saved to private storage.', 502);
  const { data, error } = await adminSupabase().from('project_workspace_sources').update({ storage_path: path, revision: nextRevision, file_count: files.length, total_bytes: total, updated_at: new Date().toISOString() }).eq('project_id', projectId).eq('user_id', userId).eq('revision', Number(current.revision || 0)).select('revision').maybeSingle();
  if (error || !data) {
    await adminSupabase().storage.from(WORKSPACE_SOURCE_BUCKET).remove([path]);
    throw new WorkspaceSourceError('Another workspace change was saved first. Reload the workspace and retry your edit.', 409);
  }
  if (current.storage_path) await adminSupabase().storage.from(WORKSPACE_SOURCE_BUCKET).remove([current.storage_path]);
  return { revision: nextRevision, totalBytes: total, fileCount: files.length };
}

export async function getWorkspaceManifest(userId: string, projectId: string): Promise<SourceManifest> {
  await loadProject(userId, projectId);
  const record = await ensureRecord(userId, projectId);
  const zip = await readArchive(record.storage_path);
  const files: SourceEntry[] = [];
  for (const f of Object.values(zip.files) as any[]) {
    if (f.dir) continue;
    const path = safeSourcePath(f.name);
    const bytes = await f.async('nodebuffer');
    files.push({ path, size: bytes.length, kind: TEXT_EXT.test(path) || !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|mp4|mp3|zip|wasm|bin)$/i.test(path) ? 'text' : 'binary' });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { projectId, revision: Number(record.revision || 0), files, totalBytes: Number(record.total_bytes || 0), updatedAt: record.updated_at || null };
}

/**
 * Merge generated chat files into the durable private workspace archive.
 * This keeps project-file edits available to isolated GitHub Actions checks
 * without replacing unrelated uploaded source files.
 */
export async function mergeWorkspaceTextFiles(userId: string, projectId: string, files: Record<string, string>) {
  await loadProject(userId, projectId);
  const entries = Object.entries(files);
  if (!entries.length) return await getWorkspaceManifest(userId, projectId);
  const current = await ensureRecord(userId, projectId);
  const zip = await readArchive(current.storage_path);
  for (const [rawPath, content] of entries) {
    const path = safeSourcePath(rawPath);
    if (typeof content !== 'string') throw new WorkspaceSourceError('Workspace source files must contain text content.', 415);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > WORKSPACE_SOURCE_MAX_FILE_BYTES) throw new WorkspaceSourceError(`${path} exceeds the 5 MB per-file limit.`, 413);
    zip.file(path, content);
  }
  await persistArchive(userId, projectId, current, zip);
  return await getWorkspaceManifest(userId, projectId);
}

/**
 * Build a bounded preview snapshot from the durable workspace archive and
 * legacy project.files. Binary image/font assets are base64 encoded for the
 * queue JSON payload; secrets and non-web workspace files are never copied.
 */
export async function getCloudflarePreviewWorkspaceFiles(
  userId: string,
  projectId: string,
  legacyFiles: Record<string, unknown> | null | undefined,
) {
  await loadProject(userId, projectId);
  const record = await ensureRecord(userId, projectId);
  const zip = await readArchive(record.storage_path);
  const output: Record<string, string | { encoding: 'base64'; data: string }> = {};

  const textExtensions = new Set([
    '.css', '.scss', '.sass', '.html', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.json', '.md', '.mdx', '.svg', '.txt', '.xml', '.webmanifest', '.yaml', '.yml', '.toml',
  ]);
  const binaryExtensions = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf',
  ]);

  for (const [rawPath, rawContent] of Object.entries(legacyFiles || {})) {
    let path: string;
    try { path = safeSourcePath(rawPath); } catch { continue; }
    if (typeof rawContent !== 'string') continue;
    const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (textExtensions.has(extension)) output[path] = rawContent;
  }

  for (const entry of Object.values(zip.files) as any[]) {
    if (entry.dir) continue;
    let path: string;
    try { path = safeSourcePath(entry.name); } catch { continue; }
    const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (!textExtensions.has(extension) && !binaryExtensions.has(extension)) continue;
    const bytes = await entry.async('nodebuffer');
    if (binaryExtensions.has(extension)) {
      output[path] = { encoding: 'base64', data: bytes.toString('base64') };
    } else {
      output[path] = bytes.toString('utf8');
    }
  }
  return output;
}

export async function importWorkspaceZip(userId: string, projectId: string, bytes: Buffer) {
  if (bytes.length < 4 || bytes.length > WORKSPACE_SOURCE_MAX_ARCHIVE_BYTES) throw new WorkspaceSourceError('ZIP uploads must be between 4 bytes and 25 MB.', 413);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new WorkspaceSourceError('Upload a valid ZIP archive.', 415);
  await loadProject(userId, projectId);
  const current = await ensureRecord(userId, projectId);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false }); }
  catch { throw new WorkspaceSourceError('The ZIP archive is invalid, encrypted, or corrupted.', 422); }
  const clean = new JSZip();
  for (const entry of Object.values(zip.files) as any[]) {
    if (entry.dir) continue;
    const path = safeSourcePath(entry.name.replace(/\/$/, ''));
    if (entry.unsafeOriginalName) throw new WorkspaceSourceError('The ZIP contains an unsafe file path.', 422);
    if (entry.unixPermissions && ((Number(entry.unixPermissions) & 0o170000) === 0o120000)) throw new WorkspaceSourceError('Symbolic links are not permitted in uploaded projects.', 422);
    clean.file(path, await entry.async('nodebuffer'));
  }
  const result = await persistArchive(userId, projectId, current, clean);
  return result;
}

export async function readWorkspaceTextFile(userId: string, projectId: string, rawPath: unknown) {
  const path = safeSourcePath(rawPath);
  await loadProject(userId, projectId);
  const record = await ensureRecord(userId, projectId);
  const zip = await readArchive(record.storage_path);
  const entry = zip.file(path);
  if (!entry) throw new WorkspaceSourceError('File not found.', 404);
  if (!TEXT_EXT.test(path)) throw new WorkspaceSourceError('This file is not classified as editable text.', 415);
  const bytes = await entry.async('nodebuffer');
  if (bytes.length > WORKSPACE_SOURCE_MAX_FILE_BYTES || bytes.includes(0)) throw new WorkspaceSourceError('This file cannot be opened as text.', 415);
  return { path, content: bytes.toString('utf8'), revision: Number(record.revision || 0) };
}

export async function writeWorkspaceTextFile(userId: string, projectId: string, rawPath: unknown, content: unknown, expectedRevision: unknown) {
  const path = safeSourcePath(rawPath);
  if (!TEXT_EXT.test(path)) throw new WorkspaceSourceError('Only supported text/code files can be edited.', 415);
  if (typeof content !== 'string') throw new WorkspaceSourceError('File content must be text.', 400);
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length > WORKSPACE_SOURCE_MAX_FILE_BYTES || bytes.includes(0)) throw new WorkspaceSourceError('File content exceeds the 5 MB text limit or contains binary data.', 413);
  await loadProject(userId, projectId);
  const current = await ensureRecord(userId, projectId);
  if (Number(expectedRevision) !== Number(current.revision || 0)) throw new WorkspaceSourceError('The workspace changed since it was opened. Reload before saving.', 409);
  const zip = await readArchive(current.storage_path);
  zip.file(path, bytes);
  const result = await persistArchive(userId, projectId, current, zip);
  return { path, ...result };
}

export async function deleteWorkspaceFile(userId: string, projectId: string, rawPath: unknown, expectedRevision: unknown) {
  const path = safeSourcePath(rawPath);
  await loadProject(userId, projectId);
  const current = await ensureRecord(userId, projectId);
  if (Number(expectedRevision) !== Number(current.revision || 0)) throw new WorkspaceSourceError('The workspace changed since it was opened. Reload before deleting.', 409);
  const zip = await readArchive(current.storage_path);
  if (!zip.file(path)) throw new WorkspaceSourceError('File not found.', 404);
  zip.remove(path);
  return { path, ...(await persistArchive(userId, projectId, current, zip)) };
}


export async function downloadWorkspaceArchive(userId: string, projectId: string) {
  await loadProject(userId, projectId);
  const record = await ensureRecord(userId, projectId);
  if (!record.storage_path) throw new WorkspaceSourceError('This workspace does not contain uploaded source files yet.', 404);
  const { data, error } = await adminSupabase().storage.from(WORKSPACE_SOURCE_BUCKET).download(record.storage_path);
  if (error || !data) throw new WorkspaceSourceError('The saved project archive could not be downloaded.', 503);
  return Buffer.from(await data.arrayBuffer());
}
