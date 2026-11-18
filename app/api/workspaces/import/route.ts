import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { fetchPublicHtml } from '@/lib/public-site-fetch';
import { normalizeIdePath, validateIdeFiles, MAX_IDE_FILE_BYTES, MAX_IDE_FILES, MAX_IDE_TOTAL_BYTES } from '@/lib/ide-files';
import { openConnectionConfig } from '@/lib/integrations/customer-connections';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials(?:\.json)?|secrets?)(?:\/|$)/i;
const SKIP_DIR = /(^|\/)(?:\.git|node_modules|vendor|dist|build|coverage|\.next|\.turbo|\.vercel|\.idea|\.vscode-test)(\/|$)/i;
const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|7z|rar|mp4|mov|mp3|wav|woff2?|ttf|otf|eot|exe|dll|so|dylib|class|jar|wasm|sqlite|db)$/i;
const SECRET_CONTENT = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["']|(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk_(?:live|test|proj)_[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}))/i;

function safeProjectName(value: string) {
  return value.trim().replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').slice(0, 100) || 'Imported project';
}
function parseGitHubRepository(value: unknown) {
  if (typeof value !== 'string' || value.length > 300) throw new Error('Enter a GitHub repository URL.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid GitHub repository URL.'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || url.search || url.hash) throw new Error('Only public HTTPS GitHub repository URLs are supported.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) throw new Error('Use a repository URL in the form https://github.com/owner/repository.');
  const owner = parts[0], repo = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') throw new Error('The GitHub repository URL contains an invalid owner or repository name.');
  return { owner, repo };
}
async function githubJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Braverton-Project-Importer' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({})) as T;
  if (!response.ok) {
    if (response.status === 404) throw new Error('GitHub could not find this repository with the selected connection. Check repository access.');
    if (response.status === 401 || response.status === 403) throw new Error('GitHub rejected the connection or its repository permissions. Reconnect GitHub and try again.');
    if (response.status === 429) throw new Error('GitHub rate limit reached. Wait a little and try again.');
    throw new Error('GitHub import request failed (HTTP ' + response.status + ').');
  }
  return body;
}
function skipRepositoryPath(path: string) {
  return !normalizeIdePath(path) || SECRET_PATH.test(path) || SKIP_DIR.test(path) || BINARY_EXT.test(path) || path.split('/').some(part => part.startsWith('.env'));
}
async function importGitHubFiles(owner: string, repo: string, token: string) {
  const repository = await githubJson<{ default_branch?: string; full_name?: string; private?: boolean }>(
    'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), token);
  const branch = repository.default_branch;
  if (!branch) throw new Error('GitHub did not return a default branch for this repository.');
  const tree = await githubJson<{ truncated?: boolean; tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }> }>(
    'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', token);
  if (tree.truncated) throw new Error('This repository is too large for a safe one-step import. Import a smaller repository or split it into focused projects.');
  const candidates = (tree.tree || []).filter(item => item.type === 'blob' && typeof item.path === 'string' && typeof item.sha === 'string' && !skipRepositoryPath(item.path) && Number(item.size || 0) <= MAX_IDE_FILE_BYTES);
  if (!candidates.length) throw new Error('No supported text source files were found in this repository.');
  const selected = candidates.slice(0, MAX_IDE_FILES);
  const files: Record<string, string> = {};
  let total = 0, skipped = candidates.length - selected.length;
  for (let offset = 0; offset < selected.length; offset += 6) {
    const batch = selected.slice(offset, offset + 6);
    const results = await Promise.all(batch.map(async item => {
      try {
        const blob = await githubJson<{ encoding?: string; content?: string }>(
          'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/blobs/' + encodeURIComponent(item.sha!), token);
        if (blob.encoding !== 'base64' || typeof blob.content !== 'string') return null;
        const buffer = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
        if (buffer.byteLength > MAX_IDE_FILE_BYTES || buffer.includes(0)) return null;
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        if (SECRET_CONTENT.test(content)) return null;
        return { path: item.path!, content, bytes: buffer.byteLength };
      } catch { return null; }
    }));
    for (const result of results) {
      if (!result) { skipped++; continue; }
      if (total + result.bytes > MAX_IDE_TOTAL_BYTES) { skipped++; continue; }
      files[result.path] = result.content;
      total += result.bytes;
    }
  }
  if (!Object.keys(files).length) throw new Error('No safe, readable text files could be imported from this repository.');
  if (!files['README.md'] && !files['readme.md']) files['README.md'] = '# ' + (repository.full_name || owner + '/' + repo) + '\n\nImported from GitHub branch ' + branch + ' into Braverton.\n\nReview imported files and secrets before building or deploying.';
  if (!validateIdeFiles(files)) throw new Error('The imported repository exceeds Braverton workspace file limits.');
  return { files, branch, fullName: repository.full_name || owner + '/' + repo, imported: Object.keys(files).length, skipped, private: Boolean(repository.private) };
}
const ZIP_MAX_BYTES = 10 * 1024 * 1024;
const IMPORT_GOALS = new Set(['modernize_ui', 'paystack_ecommerce', 'exact_redesign']);

async function importZipFile(file: File) {
  if (file.size <= 0 || file.size > ZIP_MAX_BYTES) throw new Error('Choose a ZIP file smaller than 10 MB.');
  const archive = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true, createFolders: false });
  const entries = Object.values(archive.files).filter(entry => !entry.dir);
  if (entries.length > MAX_IDE_FILES * 3) throw new Error('This ZIP contains too many entries for a safe import.');
  const files: Record<string, string> = {};
  let total = 0, skipped = 0;
  for (const entry of entries) {
    const path = entry.name.replace(/\\/g, '/');
    if (skipRepositoryPath(path) || path.split('/').some(part => part === '..' || part === '.')) { skipped++; continue; }
    const safePath = normalizeIdePath(path);
    if (!safePath) { skipped++; continue; }
    try {
      const bytes = await entry.async('uint8array');
      if (bytes.byteLength > MAX_IDE_FILE_BYTES || total + bytes.byteLength > MAX_IDE_TOTAL_BYTES || bytes.includes(0)) { skipped++; continue; }
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (SECRET_CONTENT.test(content)) { skipped++; continue; }
      files[safePath] = content;
      total += bytes.byteLength;
    } catch { skipped++; }
    if (Object.keys(files).length >= MAX_IDE_FILES) break;
  }
  if (!Object.keys(files).length) throw new Error('No safe, readable source files were found in this ZIP.');
  if (!files['README.md'] && !files['readme.md']) files['README.md'] = '# Imported ZIP project\n\nImported into Braverton. Review source files and dependencies before building or deploying.';
  if (!validateIdeFiles(files)) throw new Error('The ZIP exceeds Braverton workspace file limits.');
  return { files, imported: Object.keys(files).length, skipped };
}

function extractWebsiteStructure(html: string) {
  const decode = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 500);
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || 'Imported website';
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.slice(0, 500) || '';
  const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(match => decode(match[1])).filter(Boolean).slice(0, 40);
  const navigation = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].flatMap(match => [...match[1].matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)].map(item => decode(item[1]))).filter(Boolean).slice(0, 40);
  const brandColors = [...new Set(html.match(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/gi) || [])].slice(0, 24);
  return { title, description, headings, navigation, brandColors, pageText: htmlText(html) };
}

function htmlText(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:nav|footer|header|svg|noscript)\b[^>]*>[\s\S]*?<\/(?:nav|footer|header|svg|noscript)>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 180000);
}

export async function POST(request: NextRequest) {
  const context = await getProfile(request);
  if (!context) return NextResponse.json({ error: 'Sign in before importing a project.' }, { status: 401 });
  const limited = await enforceUserRateLimit(context.user.id, 'project-import', 5, 60);
  if (limited) return limited;
  const contentType = request.headers.get('content-type') || '';
  let body: Record<string, unknown> | null = null;
  let zipFile: File | null = null;
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    body = { source: form.get('source'), project_name: form.get('project_name'), upgrade_goal: form.get('upgrade_goal') };
    const upload = form.get('zip');
    if (upload instanceof File) zipFile = upload;
  } else {
    const parsed = await request.json().catch(() => null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  }
  if (!body) return NextResponse.json({ error: 'Send a valid import request.' }, { status: 400 });
  const source = body.source;
  if (source !== 'website' && source !== 'github' && source !== 'zip') return NextResponse.json({ error: 'Choose a website, GitHub or ZIP import.' }, { status: 400 });
  const upgradeGoal = typeof body.upgrade_goal === 'string' && IMPORT_GOALS.has(body.upgrade_goal) ? body.upgrade_goal : 'modernize_ui';
  const platformOwner = isPlatformOwner(context.profile);
  const plan = await getEffectiveUserPlan(context.user.id, platformOwner);
  if (!platformOwner && (!plan.projectTypes.includes('web_app') || !planAllows(plan, 'web-app-builder'))) return NextResponse.json({ error: 'Project workspaces are not included in your current plan.' }, { status: 403 });
  const db = adminSupabase();
  const { count, error: countError } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', context.user.id);
  if (countError) return NextResponse.json({ error: 'Project capacity could not be checked.' }, { status: 503 });
  if (!platformOwner && (count || 0) >= plan.limits.maxProjects) return NextResponse.json({ error: 'Project limit reached.' }, { status: 409 });

  try {
    let projectName = typeof body.project_name === 'string' && body.project_name.trim() ? safeProjectName(body.project_name) : '';
    let files: Record<string, string>;
    let importDetails: Record<string, unknown>;
    if (source === 'website') {
      if (typeof body.website_url !== 'string') throw new Error('Enter the live website URL you want Leo to use as a reference.');
      const fetched = await fetchPublicHtml(body.website_url);
      const structure = extractWebsiteStructure(fetched.html);
      projectName = projectName || safeProjectName(structure.title || new URL(fetched.url).hostname);
      const goalLabels: Record<string, string> = { modernize_ui: 'Modernize the user interface', paystack_ecommerce: 'Convert to e-commerce with Paystack', exact_redesign: 'Create a close visual redesign' };
      files = {
        'README.md': '# ' + projectName + '\n\nThis workspace was created from a public website reference. The original private source code was not retrieved.\n\n- Source URL: ' + fetched.url + '\n- Upgrade goal: ' + goalLabels[upgradeGoal] + '\n- Imported: ' + new Date().toISOString() + '\n\nAsk Bram to use website-reference.md as a design and content brief, then implement a new Next.js + Tailwind project.',
        'website-reference.md': '# Website reference: ' + structure.title + '\n\nSource: ' + fetched.url + '\n\n' + (structure.description ? 'Description: ' + structure.description + '\n\n' : '') + '## Upgrade goal\n\n' + goalLabels[upgradeGoal] + '\n\n## Headings\n\n' + structure.headings.map(value => '- ' + value).join('\n') + '\n\n## Navigation\n\n' + structure.navigation.map(value => '- ' + value).join('\n') + '\n\n## Detected brand colours\n\n' + structure.brandColors.map(value => '- ' + value).join('\n') + '\n\n## Extracted page copy\n\n' + (structure.pageText || 'No readable page text was found.'),
        'project-import.json': JSON.stringify({ source: 'website', url: fetched.url, title: structure.title, description: structure.description, headings: structure.headings, navigation: structure.navigation, brand_colors: structure.brandColors, upgrade_goal: upgradeGoal, imported_at: new Date().toISOString(), note: 'Reference import only; original source code was not available from the public website.' }, null, 2),
      };
      importDetails = { source, source_url: fetched.url, title: structure.title, upgrade_goal: upgradeGoal, imported_files: Object.keys(files).length, skipped_files: 0, import_mode: 'website_reference' };
    } else if (source === 'github') {
      const parsed = parseGitHubRepository(body.repository_url);
      const connectionId = typeof body.github_connection_id === 'string' ? body.github_connection_id : '';
      if (!/^[0-9a-f-]{36}$/i.test(connectionId)) throw new Error('Select a saved GitHub connection before importing a repository.');
      const { data: connection, error: connectionError } = await db.from('user_integrations').select('id,credential_ciphertext,status')
        .eq('id', connectionId).eq('user_id', context.user.id).eq('provider', 'github').maybeSingle();
      if (connectionError || !connection || connection.status !== 'verified' || !connection.credential_ciphertext) throw new Error('The selected GitHub connection is unavailable or not verified. Reconnect GitHub in Integrations.');
      const config = openConnectionConfig(connection.credential_ciphertext);
      if (typeof config.token !== 'string' || !config.token) throw new Error('The selected GitHub connection has no usable access token.');
      const imported = await importGitHubFiles(parsed.owner, parsed.repo, config.token);
      files = imported.files;
      projectName = projectName || safeProjectName(imported.fullName.split('/')[1] || parsed.repo);
      importDetails = { source, repository: imported.fullName, branch: imported.branch, imported_files: imported.imported, skipped_files: imported.skipped, private_repository: imported.private };
    } else {
      if (!zipFile) throw new Error('Choose a .zip project file to import.');
      const imported = await importZipFile(zipFile);
      files = imported.files;
      projectName = projectName || safeProjectName(zipFile.name.replace(/\.zip$/i, ''));
      importDetails = { source: 'zip', filename: zipFile.name.slice(0, 160), imported_files: imported.imported, skipped_files: imported.skipped };
    }
    const { data: project, error: insertError } = await db.from('projects').insert({
      user_id: context.user.id, project_name: projectName || 'Imported project', type: 'web_app', status: 'draft', progress: 0, files,
    }).select('id,project_name,type,status,created_at').single();
    if (insertError || !project) return NextResponse.json({ error: 'The project files were prepared, but the workspace could not be saved.' }, { status: 503 });
    return NextResponse.json({ project, import: importDetails, workspace_url: '/ide/' + encodeURIComponent(project.id) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project import failed.';
    const status = message.includes('too large') || message.includes('file limits') ? 413 : message.includes('not included') ? 403 : 400;
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
