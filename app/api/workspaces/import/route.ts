import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { fetchPublicHtml } from '@/lib/public-site-fetch';
import { normalizeIdePath, validateIdeFiles, MAX_IDE_FILE_BYTES, MAX_IDE_FILES, MAX_IDE_TOTAL_BYTES } from '@/lib/ide-files';
import { openConnectionConfig } from '@/lib/integrations/customer-connections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials(?:\.json)?|secrets?)(?:\/|$)/i;
const SKIP_DIR = /(^|\/)(?:\.git|node_modules|vendor|dist|build|coverage|\.next|\.turbo|\.vercel|\.idea|\.vscode-test)(\/|$)/i;
const BINARY_EXT = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|7z|rar|mp4|mov|mp3|wav|woff2?|ttf|otf|eot|exe|dll|so|dylib|class|jar|wasm|sqlite|db)$/i;
const SECRET_CONTENT = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["'])/i;

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
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LeonardX-Project-Importer' },
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
  if (!files['README.md'] && !files['readme.md']) files['README.md'] = '# ' + (repository.full_name || owner + '/' + repo) + '\n\nImported from GitHub branch ' + branch + ' into LeonardX.\n\nReview imported files and secrets before building or deploying.';
  if (!validateIdeFiles(files)) throw new Error('The imported repository exceeds LeonardX workspace file limits.');
  return { files, branch, fullName: repository.full_name || owner + '/' + repo, imported: Object.keys(files).length, skipped, private: Boolean(repository.private) };
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
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Send a valid import request.' }, { status: 400 });
  const source = body.source;
  if (source !== 'website' && source !== 'github') return NextResponse.json({ error: 'Choose a website or GitHub import.' }, { status: 400 });
  const platformOwner = isPlatformOwner(context.profile);
  const plan = await getEffectiveUserPlan(context.user.id, platformOwner);
  if (!platformOwner && (!plan.projectTypes.includes('web_app') || !planAllows(plan, 'web-app-builder'))) return NextResponse.json({ error: 'Project workspaces are not included in your current plan.' }, { status: 403 });
  const db = adminSupabase();
  const { count, error: countError } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', context.user.id);
  if (countError) return NextResponse.json({ error: 'Project capacity could not be checked.' }, { status: 503 });
  if (!platformOwner && (count || 0) >= plan.limits.maxProjects) return NextResponse.json({ error: 'Project limit reached.' }, { status: 409 });

  try {
    let projectName = typeof body.project_name === 'string' ? safeProjectName(body.project_name) : '';
    let files: Record<string, string>;
    let importDetails: Record<string, unknown>;
    if (source === 'website') {
      if (typeof body.website_url !== 'string') throw new Error('Enter the live website URL you want Leo to use as a reference.');
      const fetched = await fetchPublicHtml(body.website_url);
      const title = fetched.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180) || new URL(fetched.url).hostname;
      const description = fetched.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.slice(0, 500) || '';
      projectName = projectName || safeProjectName(title);
      files = {
        'README.md': '# ' + projectName + '\n\nThis workspace was created from a live website reference. A public URL does not expose the original private source code; Leo can use the saved reference to plan and rebuild an equivalent project.\n\n- Source URL: ' + fetched.url + '\n- Imported: ' + new Date().toISOString() + '\n\nReview the reference content before asking Leo to implement changes.',
        'website-reference.md': '# Website reference: ' + title + '\n\nSource: ' + fetched.url + '\n\n' + (description ? 'Description: ' + description + '\n\n' : '') + '## Extracted page text\n\n' + (htmlText(fetched.html) || 'No readable page text was found.'),
        'project-import.json': JSON.stringify({ source: 'website', url: fetched.url, title, description, imported_at: new Date().toISOString(), note: 'Reference import only; original source code was not available from the public website.' }, null, 2),
      };
      importDetails = { source, source_url: fetched.url, title, imported_files: Object.keys(files).length, skipped_files: 0, import_mode: 'website_reference' };
    } else {
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
