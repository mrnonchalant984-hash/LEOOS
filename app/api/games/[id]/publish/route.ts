import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { validateIdeFiles } from '@/lib/ide-files';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Json = Record<string, unknown>;
type Ctx = { params: Promise<{ id: string }> };
const MANIFEST = 'leonardx.publication.json';
const SECRET_PATH = /(^|\/)\.env(?:\.|$)|(^|\/)\.vercel(?:\/|$)|(^|\/)\.git(?:\/|$)|(^|\/)node_modules(?:\/|$)|(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)|private[-_]?key/i;
const SECRET_VALUE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/;
const safeSlug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54) || 'leonardx-game';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callIntegration(request: NextRequest, provider: 'github' | 'vercel', action: string, payload: Json) {
  const { POST } = await import('@/app/api/integrations/[provider]/[action]/route');
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  const response = await POST(new NextRequest(new URL(`/api/integrations/${provider}/${action}`, request.url), { method: 'POST', headers, body: JSON.stringify(payload) }), { params: Promise.resolve({ provider, action }) });
  const data = await response.json().catch(() => ({})) as Json;
  if (!response.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : `${provider}/${action} failed with HTTP ${response.status}.`);
  return data.result && typeof data.result === 'object' ? data.result as Json : data;
}
function parseManifest(files: Record<string, string>): Json {
  try { const value = JSON.parse(files[MANIFEST] || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; } catch { return {}; }
}
function cleanPublishedFiles(files: Record<string, string>) {
  const output: { path: string; content: string }[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path === MANIFEST) continue;
    if (SECRET_PATH.test(path)) throw new Error(`Publishing stopped: sensitive path rejected (${path.slice(0, 80)}).`);
    if (SECRET_VALUE.test(content)) throw new Error(`Publishing stopped: a possible secret was detected in ${path.slice(0, 80)}.`);
    if (Buffer.byteLength(content, 'utf8') > 250_000) throw new Error(`Publishing stopped: ${path} exceeds the safe GitHub text-file limit.`);
    output.push({ path, content });
  }
  if (!output.some(file => file.path === 'index.html') || !/<html\b/i.test(output.find(file => file.path === 'index.html')!.content)) throw new Error('Save a valid index.html before publishing.');
  if (output.length > 45) throw new Error('This game has more than 45 source files; reduce the export file count before publishing.');
  return output;
}
async function embedSmallAssets(userId: string, projectId: string, files: {path:string;content:string}[]) {
  const db = adminSupabase();
  const { data: assets, error } = await db.from('media_assets').select('storage_path,mime_type,size_bytes,metadata').eq('user_id', userId).eq('bucket', 'leo-files').contains('metadata', { project_id: projectId }).limit(100);
  if (error) throw new Error('Project assets could not be inspected; publication stopped safely.');
  let totalBytes = 0;
  for (const asset of assets || []) {
    const path = typeof asset.metadata?.project_path === 'string' ? asset.metadata.project_path : '';
    if (!path || !files.some(file => file.content.includes(path))) continue;
    if (!['image/png','image/jpeg','image/webp','audio/mpeg','audio/ogg','audio/wav'].includes(String(asset.mime_type))) throw new Error(`Cannot publish unsupported asset type for ${String(asset.metadata?.original_name || 'asset')}.`);
    const { data, error: downloadError } = await db.storage.from('leo-files').download(asset.storage_path);
    if (downloadError || !data) throw new Error('A private game asset could not be retrieved. Nothing was published.');
    const bytes = new Uint8Array(await data.arrayBuffer());
    totalBytes += bytes.byteLength;
    // GitHub's text-file API is used by the existing integration; inline only small assets so the live game does not depend on expiring signed URLs.
    if (totalBytes > 150_000) throw new Error('This game uses more than 150 KB of uploaded assets. Optimize the images/audio before publishing; private signed URLs are never published because they expire.');
    const dataUri = `data:${asset.mime_type};base64,${Buffer.from(bytes).toString('base64')}`;
    for (const file of files) file.content = file.content.split(path).join(dataUri);
  }
  for (const file of files) if (Buffer.byteLength(file.content, 'utf8') > 250_000) throw new Error(`Embedding game assets made ${file.path} too large for the connected GitHub integration. Optimize assets before publishing.`);
  return files;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in before publishing a browser game.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'browser-game-publish', 3, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid game project ID.' }, { status: 400 });
  const requestBody = await request.json().catch(() => ({})) as Json;
  if (requestBody.confirm !== true) return NextResponse.json({ error: 'Press Publish and confirm the action to create/update a GitHub repository and production deployment.' }, { status: 400 });
  const db = adminSupabase();
  const { data: project, error } = await db.from('projects').select('id,user_id,project_name,type,files').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  if (!project || project.type !== 'game') return NextResponse.json({ error: 'Browser game project not found in this account.' }, { status: 404 });
  if (!validateIdeFiles(project.files)) return NextResponse.json({ error: 'Project files failed safety validation.' }, { status: 422 });
  try {
    let files = cleanPublishedFiles(project.files);
    files = await embedSmallAssets(ctx.user.id, id, files);
    const prior = parseManifest(project.files);
    let repo = typeof prior.repo === 'string' ? prior.repo : '';
    let branch = typeof prior.branch === 'string' ? prior.branch : 'main';
    let repoUrl = typeof prior.repo_url === 'string' ? prior.repo_url : '';
    if (!repo) {
      const suffix = id.replaceAll('-', '').slice(0, 8);
      const repoName = `${safeSlug(project.project_name)}-${suffix}`.slice(0, 95);
      const created = await callIntegration(request, 'github', 'create-repo', { name: repoName, private: true, description: `Browser game published with LeonardX: ${String(project.project_name).slice(0, 180)}`, confirm: true });
      repo = typeof created.full_name === 'string' ? created.full_name : '';
      branch = typeof created.default_branch === 'string' ? created.default_branch : 'main';
      repoUrl = typeof created.html_url === 'string' ? created.html_url : `https://github.com/${repo}`;
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('GitHub created a repository but did not return a verified owner/repository name. Check GitHub before retrying.');
      const earlyManifest = { repo, branch, repo_url: repoUrl, state: 'source_created', updated_at: new Date().toISOString() };
      const { error: persistRepoError } = await db.from('projects').update({ files: { ...project.files, [MANIFEST]: JSON.stringify(earlyManifest, null, 2) } }).eq('id', id).eq('user_id', ctx.user.id);
      if (persistRepoError) throw new Error(`GitHub repository ${repo} was created, but its recovery metadata could not be saved. Do not create another repository until you inspect GitHub.`);
    }
    const committed = await callIntegration(request, 'github', 'commit-files', { repo, branch, message: `Publish ${String(project.project_name).slice(0, 120)} via LeonardX`, files, confirm: true });
    const commitSha = typeof committed.commit_sha === 'string' ? committed.commit_sha : '';
    if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error('GitHub did not confirm the source commit. No deployment was started.');
    const commitStatus = await callIntegration(request, 'github', 'commit-status', { repo, sha: commitSha });
    const combinedState = String(commitStatus.combined_state || 'unknown').toLowerCase();
    const checkpoint = { repo, branch, repo_url: repoUrl || `https://github.com/${repo}`, commit_sha: commitSha, commit_url: typeof committed.commit_url === 'string' ? committed.commit_url : `https://github.com/${repo}/commit/${commitSha}`, commit_checks: { combined_state: combinedState, total_count: Number(commitStatus.total_count || 0) }, state: 'source_committed', updated_at: new Date().toISOString() };
    const { error: checkpointError } = await db.from('projects').update({ files: { ...project.files, [MANIFEST]: JSON.stringify(checkpoint, null, 2) }, status: 'building', progress: 60 }).eq('id', id).eq('user_id', ctx.user.id);
    if (checkpointError) throw new Error(`GitHub source was committed (${commitSha}) but recovery status could not be persisted. Inspect the repository before retrying.`);
    if (['failure','error'].includes(combinedState)) throw new Error(`GitHub reported ${combinedState} checks for commit ${commitSha}. Inspect the failed checks before deploying.`);
    const deployName = `${safeSlug(project.project_name).slice(0, 48) || 'leonardx-game'}-${id.replaceAll('-', '').slice(0, 8)}`.slice(0, 99);
    if (prior.vercel_project_created !== true) {
      const vercelProject = await callIntegration(request, 'vercel', 'create-project', { name: deployName, framework: 'other', gitRepository: { type: 'github', repo } });
      const projectCheckpoint = { ...checkpoint, vercel_project_created: true, vercel_project_id: String(vercelProject.id || vercelProject.name || deployName), state: 'vercel_project_created', updated_at: new Date().toISOString() };
      const { error: projectCheckpointError } = await db.from('projects').update({ files: { ...project.files, [MANIFEST]: JSON.stringify(projectCheckpoint, null, 2) }, status: 'building', progress: 65 }).eq('id', id).eq('user_id', ctx.user.id);
      if (projectCheckpointError) throw new Error('Vercel project was created but its recovery metadata could not be saved. Inspect Vercel before retrying.');
    }
    const deployment = await callIntegration(request, 'vercel', 'deploy-git-repo', { name: deployName, repo, ref: branch, confirm: true });
    const deploymentId = String(deployment.id || deployment.uid || '');
    if (!deploymentId || !/^[A-Za-z0-9_.-]{1,200}$/.test(deploymentId)) throw new Error(`GitHub source was committed (${commitSha}), but Vercel did not return a verifiable deployment ID. Check the Vercel dashboard before retrying.`);
    let latest: Json = deployment;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await sleep(1800);
      latest = await callIntegration(request, 'vercel', 'deployment-status', { deploymentId });
      const state = String(latest.state || '').toUpperCase();
      if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') break;
    }
    const state = String(latest.state || 'UNKNOWN').toUpperCase();
    const liveUrl = state === 'READY' && typeof latest.url === 'string' && /^https:\/\/[a-z0-9.-]+(?:\/.*)?$/i.test(latest.url) ? latest.url : null;
    const publication = { repo, branch, repo_url: repoUrl || `https://github.com/${repo}`, vercel_project_created: true, vercel_project_id: String(prior.vercel_project_id || deployName), commit_sha: commitSha, commit_url: typeof committed.commit_url === 'string' ? committed.commit_url : `https://github.com/${repo}/commit/${commitSha}`, commit_checks: { combined_state: String(commitStatus.combined_state || 'unknown'), total_count: Number(commitStatus.total_count || 0) }, deployment_id: deploymentId, deployment_state: state, deployment_url: typeof latest.url === 'string' ? latest.url : null, live_url: liveUrl, state: liveUrl ? 'published' : state === 'ERROR' || state === 'CANCELED' ? 'failed' : 'building', updated_at: new Date().toISOString(), last_error: typeof latest.errorMessage === 'string' ? latest.errorMessage.slice(0, 800) : null };
    const { error: persistError } = await db.from('projects').update({ files: { ...project.files, [MANIFEST]: JSON.stringify(publication, null, 2) }, status: liveUrl ? 'completed' : state === 'ERROR' ? 'failed' : 'building', progress: liveUrl ? 100 : 75 }).eq('id', id).eq('user_id', ctx.user.id);
    if (persistError) return NextResponse.json({ error: 'Provider operation completed but publication status could not be persisted. Inspect the GitHub commit and Vercel deployment before retrying.', repository: repoUrl, commit_sha: commitSha, deployment_id: deploymentId, deployment_state: state, published: false }, { status: 502 });
    return NextResponse.json({ success: Boolean(liveUrl), published: Boolean(liveUrl), state: publication.state, live_url: liveUrl, repository: publication.repo_url, commit_url: publication.commit_url, commit_sha: commitSha, deployment_id: deploymentId, deployment_state: state, message: liveUrl ? 'Vercel confirmed the deployment is READY.' : state === 'ERROR' ? `Vercel deployment failed${publication.last_error ? `: ${publication.last_error}` : '.'}` : 'GitHub source was committed. Vercel is still building; no public URL is claimed until Vercel reports READY.' }, { status: liveUrl ? 200 : state === 'ERROR' ? 502 : 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Browser-game publishing failed.';
    return NextResponse.json({ error: message.slice(0, 700), published: false }, { status: /Connect github|Connect vercel/i.test(message) ? 424 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const { data: project, error } = await adminSupabase().from('projects').select('id,files,type').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Project status is unavailable.' }, { status: 503 });
  if (!project || project.type !== 'game') return NextResponse.json({ error: 'Browser game project not found.' }, { status: 404 });
  let publication: Json = {};
  try { const parsed = JSON.parse(String((project.files as Record<string,string>)?.[MANIFEST] || '{}')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) publication = parsed as Json; } catch { /* no publication yet */ }
  return NextResponse.json({ publication }, { headers: { 'Cache-Control': 'private, no-store' } });
}


export async function DELETE(request: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Json;
  if (body.confirm !== true) return NextResponse.json({ error: 'Confirm unpublishing before deleting the Vercel deployment.' }, { status: 400 });
  const db = adminSupabase();
  const { data: project, error } = await db.from('projects').select('id,type,files').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  if (!project || project.type !== 'game') return NextResponse.json({ error: 'Browser game project not found in this account.' }, { status: 404 });
  const files = project.files as Record<string,string>;
  const publication = parseManifest(files);
  const deploymentId = typeof publication.deployment_id === 'string' ? publication.deployment_id : '';
  if (!deploymentId) return NextResponse.json({ error: 'This game has no recorded Vercel deployment to unpublish.' }, { status: 409 });
  try {
    const result = await callIntegration(request, 'vercel', 'delete-deployment', { deploymentId, confirm: true });
    if (result.deleted !== true) throw new Error('Vercel did not confirm deletion; publication state was not changed.');
    const updated = { ...publication, state: 'unpublished', live_url: null, deployment_state: 'DELETED', updated_at: new Date().toISOString() };
    const { error: saveError } = await db.from('projects').update({ files: { ...files, [MANIFEST]: JSON.stringify(updated, null, 2) }, status: 'draft', progress: 75 }).eq('id', id).eq('user_id', ctx.user.id);
    if (saveError) return NextResponse.json({ error: 'Vercel confirmed deletion, but the local publication state could not be saved. Refresh status before retrying.', unpublished: false }, { status: 502 });
    return NextResponse.json({ unpublished: true, deployment_id: deploymentId, repository: typeof publication.repo_url === 'string' ? publication.repo_url : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message.slice(0, 700) : 'Unpublishing failed.', unpublished: false }, { status: 502 });
  }
}
