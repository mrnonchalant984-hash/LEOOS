import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { openConnectionConfig, sealConnectionConfig, type CustomerProvider } from '@/lib/integrations/customer-connections';

export const runtime = 'nodejs';
type Json = Record<string, unknown>;
const GRAPH = process.env.META_GRAPH_VERSION || 'v23.0';
class ProviderOperationError extends Error {}
async function providerFetch(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const detail = typeof data.error === 'object' && data.error && 'message' in data.error ? String((data.error as Json).message) : `Provider returned HTTP ${response.status}.`;
    throw new ProviderOperationError(detail.slice(0, 400));
  }
  return data;
}
async function getConnection(userId: string, provider: CustomerProvider, connectionId?: string) {
  let query = adminSupabase().from('user_integrations').select('id,credential_ciphertext,status,metadata').eq('user_id', userId).eq('provider', provider).in('status', ['verified', 'configured']).order('created_at', { ascending: false }).limit(1);
  if (connectionId) query = adminSupabase().from('user_integrations').select('id,credential_ciphertext,status,metadata').eq('user_id', userId).eq('provider', provider).eq('id', connectionId).in('status', ['verified', 'configured']).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error(`Connect ${provider} in your own Integrations settings first.`);
  let config = openConnectionConfig(data.credential_ciphertext);
  if ((provider === 'firebase' || provider === 'youtube') && config.refresh_token && Number(config.expires_at || 0) < Date.now() + 60_000) {
    const refreshed = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '', client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '', refresh_token: config.refresh_token, grant_type: 'refresh_token' }).toString(), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const tokenData = await refreshed.json().catch(() => ({})) as Json;
    if (!refreshed.ok || typeof tokenData.access_token !== 'string') throw new Error('Google authorization expired. Reconnect this account to restore access.');
    config = { ...config, access_token: tokenData.access_token, expires_at: String(Date.now() + Number(tokenData.expires_in || 3600) * 1000) };
    await adminSupabase().from('user_integrations').update({ credential_ciphertext: sealConnectionConfig(config), last_verified_at: new Date().toISOString(), status: 'verified', last_error_code: null }).eq('id', data.id).eq('user_id', userId);
  }
  return { ...data, config };
}
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string; action: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-integration-operation', 20, 60);
  if (limited) return limited;
  const { provider: providerParam, action } = await context.params;
  const body = await request.json().catch(() => ({})) as Json;
  const providers = ['github','vercel','supabase','firebase','openai','anthropic','google_gemini','whatsapp_business','meta','youtube','custom_mcp'];
  if (!providers.includes(providerParam)) return NextResponse.json({ error: 'Unsupported integration provider.' }, { status: 400 });
  const provider = providerParam as CustomerProvider;
  try {
    const connection = await getConnection(ctx.user.id, provider, typeof body.connectionId === 'string' ? body.connectionId : undefined);
    const c = connection.config;
    let result: Json;
    if (provider === 'firebase' && action === 'project') {
      const projectId = typeof body.projectId === 'string' ? body.projectId : c.project_id;
      if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('Provide a valid Firebase project ID.');
      result = await providerFetch(`https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}`, c.access_token);
    } else if (provider === 'firebase' && action === 'firestore-document') {
      const projectId = typeof body.projectId === 'string' ? body.projectId : c.project_id;
      const path = typeof body.path === 'string' ? body.path.replace(/^\/+|\/+$/g, '') : '';
      if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){1,19}$/.test(path) || path.split('/').length % 2 !== 0) throw new Error('Provide a valid Firebase project ID and document path (collection/document pairs).');
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path.split('/').map(encodeURIComponent).join('/')}`;
      if (body.mode === 'read') result = await providerFetch(url, c.access_token);
      else {
        if (body.confirm !== true || !body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) throw new Error('Firestore writes require confirm=true and a valid fields object.');
        result = await providerFetch(url, c.access_token, { method: 'PATCH', body: JSON.stringify({ fields: body.fields }) });
      }
    } else if (provider === 'youtube' && action === 'channel') {
      result = await providerFetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', c.access_token);
    } else if (provider === 'youtube' && action === 'analytics') {
      const startDate = typeof body.startDate === 'string' ? body.startDate : '';
      const endDate = typeof body.endDate === 'string' ? body.endDate : '';
      const metric = typeof body.metric === 'string' && ['views','estimatedMinutesWatched','subscribersGained','likes','comments','shares'].includes(body.metric) ? body.metric : 'views';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error('Provide valid startDate and endDate in YYYY-MM-DD format.');
      const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
      url.searchParams.set('ids', 'channel==MINE'); url.searchParams.set('startDate', startDate); url.searchParams.set('endDate', endDate); url.searchParams.set('metrics', metric); url.searchParams.set('dimensions', 'day'); url.searchParams.set('sort', 'day');
      result = await providerFetch(url.toString(), c.access_token);
    } else if (provider === 'meta' && action === 'pages') {
      const pages = await providerFetch(`https://graph.facebook.com/${GRAPH}/me/accounts?fields=id,name,access_token,category,tasks`, c.access_token);
      result = { ...pages, data: Array.isArray(pages.data) ? (pages.data as Json[]).map(({ access_token: _secret, ...page }) => page) : [] };
    } else if (provider === 'meta' && action === 'page-insights') {
      const pageId = typeof body.pageId === 'string' ? body.pageId : '';
      const metrics = typeof body.metrics === 'string' ? body.metrics : 'page_impressions,page_engaged_users';
      if (!/^\d{3,30}$/.test(pageId)) throw new Error('Provide a valid Facebook Page ID.');
      const allowedMetrics = new Set(['page_impressions','page_engaged_users','page_post_engagements','page_fans','page_views_total']);
      const chosen = metrics.split(',').map(x => x.trim()); if (!chosen.length || chosen.some(x => !allowedMetrics.has(x))) throw new Error('One or more requested Page metrics are not supported by this endpoint.');
      const pageList = await providerFetch(`https://graph.facebook.com/${GRAPH}/me/accounts?fields=id,access_token`, c.access_token);
      const pageRows = Array.isArray(pageList.data) ? pageList.data as Json[] : []; const page = pageRows.find(row => row.id === pageId);
      if (!page || typeof page.access_token !== 'string') throw new Error('That Page is not accessible to the connected account or the required Page permissions are missing.');
      const url = new URL(`https://graph.facebook.com/${GRAPH}/${pageId}/insights`); url.searchParams.set('metric', chosen.join(','));
      result = await providerFetch(url.toString(), page.access_token);
    } else if (provider === 'meta' && action === 'send-message') {
      const pageId = typeof body.pageId === 'string' ? body.pageId : ''; const recipientId = typeof body.recipientId === 'string' ? body.recipientId : ''; const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!/^\d{3,30}$/.test(pageId) || !/^\d{3,30}$/.test(recipientId) || !message || message.length > 2000) throw new Error('Provide valid Page and recipient IDs and a message under 2,000 characters.');
      if (body.confirm !== true) throw new Error('Set confirm=true after reviewing the Messenger recipient and message.');
      const pageList = await providerFetch(`https://graph.facebook.com/${GRAPH}/me/accounts?fields=id,access_token`, c.access_token); const pages = Array.isArray(pageList.data) ? pageList.data as Json[] : []; const page = pages.find(row => row.id === pageId);
      if (!page || typeof page.access_token !== 'string') throw new Error('The selected Facebook Page is not available to this account.');
      result = await providerFetch(`https://graph.facebook.com/${GRAPH}/${pageId}/messages`, page.access_token, { method: 'POST', body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: message } }) });
    } else if (provider === 'whatsapp_business' && action === 'send') {
      const phoneId = typeof body.phoneNumberId === 'string' ? body.phoneNumberId : c.phone_number_id;
      const to = typeof body.to === 'string' ? body.to.replace(/\D/g, '') : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!phoneId || !/^\d{5,30}$/.test(phoneId) || !/^\d{8,15}$/.test(to) || !message || message.length > 4000) throw new Error('Provide a valid WhatsApp phone number ID, recipient number, and message (max 4,000 characters).');
      if (body.confirm !== true) throw new Error('Set confirm=true after reviewing the recipient and message.');
      result = await providerFetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, c.access_token, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: message } }) });
    } else if (provider === 'supabase' && action === 'apply-migration') {
      const projectRef = new URL(c.project_url).hostname.split('.')[0];
      const sql = typeof body.sql === 'string' ? body.sql.trim() : '';
      const migrationName = typeof body.migrationName === 'string' ? body.migrationName.trim().slice(0, 120) : '';
      if (!migrationName || !sql || sql.length > 100_000) throw new Error('Provide a migration name and SQL between 1 and 100,000 characters.');
      if (body.confirm !== true) throw new Error('Explicit confirmation is required before running SQL against the connected database.');
      // Supabase Management API executes this using the user's own project access token.
      result = await providerFetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, c.access_token, { method: 'POST', body: JSON.stringify({ query: sql }) });
      const { error: auditError } = await adminSupabase().from('integration_migration_runs').insert({ user_id: ctx.user.id, integration_id: connection.id, project_ref: projectRef, migration_name: migrationName, sql_sha256: await (async()=>{ const bytes = new TextEncoder().encode(sql); const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join(''); })(), status: 'succeeded' });
      if (auditError) return NextResponse.json({ error: 'SQL was accepted by the provider, but audit persistence failed. Check the database before retrying to avoid applying a migration twice.' }, { status: 502 });
    } else if (provider === 'vercel' && action === 'create-project') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(name)) throw new Error('Project name must use lowercase letters, numbers, and hyphens.');
      result = await providerFetch('https://api.vercel.com/v10/projects', c.token, { method: 'POST', body: JSON.stringify({ name, ...(typeof body.framework === 'string' ? { framework: body.framework } : {}), ...(typeof body.gitRepository === 'object' && body.gitRepository ? { gitRepository: body.gitRepository } : {}) }) });
    } else if (provider === 'vercel' && action === 'deploy-git-repo') {
      if (body.confirm !== true) throw new Error('Explicit confirmation is required before starting a production deployment.');
      const name = typeof body.name === 'string' ? body.name.trim() : ''; const repo = typeof body.repo === 'string' ? body.repo : ''; const ref = typeof body.ref === 'string' ? body.ref : 'main';
      if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(name) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(ref)) throw new Error('Provide a valid project name, owner/repository, and Git reference.');
      result = await providerFetch('https://api.vercel.com/v13/deployments', c.token, { method: 'POST', body: JSON.stringify({ name, gitSource: { type: 'github', repo, ref }, target: 'production' }) });
    } else if (provider === 'github' && action === 'create-repo') {
      if (body.confirm !== true) throw new Error('Explicit confirmation is required before creating a repository.');
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(name)) throw new Error('Repository name may contain letters, numbers, dots, underscores, and hyphens.');
      result = await providerFetch('https://api.github.com/user/repos', c.token, { method: 'POST', headers: { 'User-Agent': 'LeonardX', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ name, private: body.private !== false, auto_init: true, description: typeof body.description === 'string' ? body.description.slice(0, 350) : 'Created with LeonardX' }) });
    } else if (provider === 'github' && action === 'read-file') {
      const repo = typeof body.repo === 'string' ? body.repo : ''; const path = typeof body.path === 'string' ? body.path : ''; const branch = typeof body.branch === 'string' ? body.branch : 'main';
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@/-]{1,240}$/.test(path) || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch)) throw new Error('Provide a valid repository, safe relative file path, and branch.');
      if (/(^|\/)\.env(?:\.|$)|(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)|private[-_]?key/i.test(path)) throw new Error('Secret and environment files cannot be read through the repository agent.');
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const file = await providerFetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, c.token, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (typeof file.content !== 'string' || file.encoding !== 'base64') throw new Error('GitHub returned a directory, binary file, or unsupported file encoding.');
      const decoded = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16})\b/.test(decoded)) throw new Error('The requested file appears to contain credentials or a private key and cannot be returned.');
      if (Buffer.byteLength(decoded, 'utf8') > 256_000) throw new Error('The requested file exceeds the 256 KB read limit.');
      result = { name: file.name, path: file.path, sha: file.sha, size: file.size, branch, content: decoded };
    } else if (provider === 'github' && action === 'commit-status') {
      const repo = typeof body.repo === 'string' ? body.repo : ''; const sha = typeof body.sha === 'string' ? body.sha : '';
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Provide a valid repository and full 40-character commit SHA.');
      const [checks, status] = await Promise.all([
        providerFetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, c.token, { headers:{Accept:'application/vnd.github+json','User-Agent':'LeonardX','X-GitHub-Api-Version':'2022-11-28'} }),
        providerFetch(`https://api.github.com/repos/${repo}/commits/${sha}/status`, c.token, { headers:{Accept:'application/vnd.github+json','User-Agent':'LeonardX','X-GitHub-Api-Version':'2022-11-28'} }),
      ]);
      result = { repo, sha, combined_state: status.state || 'unknown', total_count: Number(checks.total_count || 0), checks: (Array.isArray(checks.check_runs) ? checks.check_runs as Json[] : []).slice(0,100).map(row=>({name:row.name,status:row.status,conclusion:row.conclusion,details_url:row.details_url,started_at:row.started_at,completed_at:row.completed_at,output:row.output&&typeof row.output==='object'?{title:(row.output as Json).title,summary:typeof (row.output as Json).summary==='string'?String((row.output as Json).summary).slice(0,1000):undefined}:undefined})), statuses: (Array.isArray(status.statuses)?status.statuses as Json[]:[]).slice(0,100).map(row=>({context:row.context,state:row.state,description:typeof row.description==='string'?row.description.slice(0,500):undefined,target_url:row.target_url})) };
    } else if (provider === 'github' && action === 'repository-tree') {
      const repo = typeof body.repo === 'string' ? body.repo : ''; const branch = typeof body.branch === 'string' ? body.branch : 'main';
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch)) throw new Error('Provide a valid repository and branch.');
      const ref = await providerFetch(`https://api.github.com/repos/${repo}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, c.token, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX' } });
      const treeSha = String((ref.object as Json | undefined)?.sha || ''); if (!/^[0-9a-f]{40}$/i.test(treeSha)) throw new Error('GitHub branch head could not be resolved.');
      const tree = await providerFetch(`https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`, c.token, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX' } });
      result = { repo, branch, truncated: tree.truncated === true, files: (Array.isArray(tree.tree) ? tree.tree as Json[] : []).filter(item => item.type === 'blob').slice(0, 500).map(item => ({ path: item.path, sha: item.sha, size: item.size })) };
    } else if (provider === 'github' && action === 'commit-files') {
      const repo = typeof body.repo === 'string' ? body.repo : ''; const branch = typeof body.branch === 'string' ? body.branch : 'main';
      const files = Array.isArray(body.files) ? body.files as Json[] : [];
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch) || files.length < 1 || files.length > 50) throw new Error('Provide a valid repository, branch, and 1–50 files.');
      if (body.confirm !== true) throw new Error('Explicit confirmation is required before committing to the connected repository.');
      const seen = new Set<string>(); const normalized = files.map(file => {
        const path = typeof file.path === 'string' ? file.path : ''; const content = typeof file.content === 'string' ? file.content : '';
        if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@/-]{1,240}$/.test(path) || content.length > 256_000 || seen.has(path)) throw new Error('A changed file has an invalid path, duplicate path, or exceeds 256 KB.');
        if (/(^|\/)\.env(?:\.|$)|(^|\/)node_modules(?:\/|$)|(^|\/)\.git(?:\/|$)|private[-_]?key/i.test(path) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})\b/.test(content)) throw new Error('Credential, secret, or generated dependency files cannot be committed.');
        seen.add(path); return { path, content };
      });
      const ref = await providerFetch(`https://api.github.com/repos/${repo}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, c.token, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX' } });
      const parentSha = String((ref.object as Json | undefined)?.sha || ''); if (!/^[0-9a-f]{40}$/i.test(parentSha)) throw new Error('GitHub branch head could not be resolved.');
      const parent = await providerFetch(`https://api.github.com/repos/${repo}/git/commits/${parentSha}`, c.token, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX' } });
      const blobs = await Promise.all(normalized.map(async file => { const blob = await providerFetch(`https://api.github.com/repos/${repo}/git/blobs`, c.token, { method:'POST', headers:{ Accept:'application/vnd.github+json', 'User-Agent':'LeonardX' }, body:JSON.stringify({ content:file.content, encoding:'utf-8' }) }); const sha = String(blob.sha || ''); if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('GitHub did not confirm a source blob.'); return { path:file.path, mode:'100644', type:'blob', sha }; }));
      const tree = await providerFetch(`https://api.github.com/repos/${repo}/git/trees`, c.token, { method:'POST', headers:{ Accept:'application/vnd.github+json', 'User-Agent':'LeonardX' }, body:JSON.stringify({ base_tree: parent.tree && typeof parent.tree === 'object' ? (parent.tree as Json).sha : undefined, tree: blobs }) });
      const treeSha = String(tree.sha || ''); if (!/^[0-9a-f]{40}$/i.test(treeSha)) throw new Error('GitHub did not confirm the new source tree.');
      const commit = await providerFetch(`https://api.github.com/repos/${repo}/git/commits`, c.token, { method:'POST', headers:{ Accept:'application/vnd.github+json', 'User-Agent':'LeonardX' }, body:JSON.stringify({ message:typeof body.message==='string'?body.message.slice(0,180):'Update source via LeonardX', tree:treeSha, parents:[parentSha] }) });
      const commitSha = String(commit.sha || ''); if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error('GitHub did not confirm the commit.');
      await providerFetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, c.token, { method:'PATCH', headers:{ Accept:'application/vnd.github+json', 'User-Agent':'LeonardX' }, body:JSON.stringify({ sha:commitSha, force:false }) });
      result = { committed:true, repo, branch, commit_sha:commitSha, files:normalized.map(file=>file.path), commit_url:`https://github.com/${repo}/commit/${commitSha}` };
    } else if (provider === 'vercel' && action === 'delete-deployment') {
      const deploymentId = typeof body.deploymentId === 'string' ? body.deploymentId.trim() : '';
      if (body.confirm !== true) throw new Error('Explicit confirmation is required before deleting a production deployment.');
      if (!deploymentId || !/^[A-Za-z0-9_.-]{1,200}$/.test(deploymentId)) throw new Error('Provide a valid Vercel deployment ID.');
      await providerFetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`, c.token, { method: 'DELETE' });
      result = { deleted: true, deployment_id: deploymentId };
    } else if (provider === 'vercel' && action === 'deployment-status') {
      const deploymentId = typeof body.deploymentId === 'string' ? body.deploymentId.trim() : '';
      if (!deploymentId || !/^[A-Za-z0-9_.-]{1,200}$/.test(deploymentId)) throw new Error('Provide a valid Vercel deployment ID.');
      const deployment = await providerFetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`, c.token);
      const events = await fetch(`https://api.vercel.com/v2/deployments/${encodeURIComponent(deploymentId)}/events?limit=100`, { headers:{ Authorization:`Bearer ${c.token}`, Accept:'application/json' }, cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000) });
      const eventPayload = await events.json().catch(()=>null) as unknown;
      const eventRows = Array.isArray(eventPayload) ? eventPayload : eventPayload && typeof eventPayload==='object' && Array.isArray((eventPayload as Json).events) ? (eventPayload as Json).events as unknown[] : [];
      result = { id:deployment.id || deployment.uid || deploymentId, name:deployment.name, state:deployment.readyState || deployment.state || deployment.status || 'unknown', url:typeof deployment.url==='string' ? `https://${deployment.url.replace(/^https?:\/\//,'')}` : null, createdAt:deployment.createdAt || null, errorCode:deployment.errorCode || null, errorMessage:typeof deployment.errorMessage==='string'?deployment.errorMessage.slice(0,1000):null, events:eventRows.slice(-60).map((event: unknown) => { const row=event && typeof event==='object'?event as Json:{}; return { type:row.type || row.text || row.status || null, created:row.created || row.createdAt || null, text:typeof row.text==='string'?row.text.slice(0,1000):undefined, payload:row.payload && typeof row.payload==='object'?Object.fromEntries(Object.entries(row.payload as Json).filter(([key])=>/error|message|status|stage|command|line/i.test(key)).slice(0,12)):undefined }; }) };
    } else if (provider === 'github' && action === 'commit-file') {
      const repo = typeof body.repo === 'string' ? body.repo : ''; const path = typeof body.path === 'string' ? body.path : ''; const content = typeof body.content === 'string' ? body.content : '';
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@/-]{1,240}$/.test(path) || content.length > 500_000) throw new Error('Provide a valid owner/repository, safe file path, and content under 500 KB.');
      if (body.confirm !== true) throw new Error('Explicit confirmation is required before committing to the connected repository.');
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const prior = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
      let sha: string | undefined; if (prior.ok) { const data = await prior.json() as Json; if (typeof data.sha === 'string') sha = data.sha; } else if (prior.status !== 404) throw new Error(`GitHub file lookup failed with HTTP ${prior.status}.`);
      result = await providerFetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}`, c.token, { method: 'PUT', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LeonardX', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ message: typeof body.message === 'string' ? body.message.slice(0, 200) : `Update ${path} via LeonardX`, content: Buffer.from(content, 'utf8').toString('base64'), ...(sha ? { sha } : {}), ...(typeof body.branch === 'string' ? { branch: body.branch } : {}) }) });
    } else {
      return NextResponse.json({ error: `The ${provider}/${action} operation is not implemented.`, supportedActions: supportedActions(provider) }, { status: 501 });
    }
    return NextResponse.json({ ok: true, provider, action, result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof ProviderOperationError ? 502 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration operation failed.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
function supportedActions(provider: CustomerProvider) {
  const actions: Partial<Record<CustomerProvider, string[]>> = { github: ['create-repo','read-file','repository-tree','commit-file','commit-files','commit-status'], vercel: ['create-project','deploy-git-repo','deployment-status','delete-deployment'], supabase: ['apply-migration'], firebase: ['project','firestore-document'], youtube: ['channel','analytics'], meta: ['pages','page-insights','send-message'], whatsapp_business: ['send'] };
  return actions[provider] || [];
}
