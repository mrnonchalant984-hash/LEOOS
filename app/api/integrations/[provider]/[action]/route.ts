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
      const name = typeof body.name === 'string' ? body.name.trim() : ''; const repo = typeof body.repo === 'string' ? body.repo : ''; const ref = typeof body.ref === 'string' ? body.ref : 'main';
      if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(name) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(ref)) throw new Error('Provide a valid project name, owner/repository, and Git reference.');
      result = await providerFetch('https://api.vercel.com/v13/deployments', c.token, { method: 'POST', body: JSON.stringify({ name, gitSource: { type: 'github', repo, ref }, target: 'production' }) });
    } else if (provider === 'github' && action === 'create-repo') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(name)) throw new Error('Repository name may contain letters, numbers, dots, underscores, and hyphens.');
      result = await providerFetch('https://api.github.com/user/repos', c.token, { method: 'POST', headers: { 'User-Agent': 'LeonardX', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ name, private: body.private !== false, auto_init: true, description: typeof body.description === 'string' ? body.description.slice(0, 350) : 'Created with LeonardX' }) });
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
  const actions: Partial<Record<CustomerProvider, string[]>> = { github: ['create-repo','commit-file'], vercel: ['create-project','deploy-git-repo'], supabase: ['apply-migration'], firebase: ['project','firestore-document'], youtube: ['channel','analytics'], meta: ['pages','page-insights','send-message'], whatsapp_business: ['send'] };
  return actions[provider] || [];
}
