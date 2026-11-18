import { adminSupabase } from '@/lib/auth';
import { openConnectionConfig } from '@/lib/integrations/customer-connections';

const VERCEL_API = 'https://api.vercel.com';

function teamQuery(token: string) {
  return token === process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
}

/** Resolve the hosting credential belonging to the website owner. Platform credentials remain a legacy fallback. */
export async function getVercelTokenForUser(userId: string): Promise<string> {
  if (!userId) throw new Error('A website owner is required to resolve its Vercel account.');
  const { data, error } = await adminSupabase().from('user_integrations')
    .select('credential_ciphertext')
    .eq('user_id', userId).eq('provider', 'vercel').eq('status', 'verified')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Could not resolve the website owner’s verified Vercel connection.');
  if (data?.credential_ciphertext) {
    const config = openConnectionConfig(data.credential_ciphertext);
    if (typeof config.token === 'string' && config.token.trim()) return config.token.trim();
    throw new Error('The website owner’s verified Vercel connection has no usable token. Reconnect Vercel.');
  }
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  throw new Error('No verified customer Vercel connection or platform VERCEL_TOKEN is configured.');
}

async function vercel(path: string, init: RequestInit = {}, suppliedToken?: string) {
  const token = suppliedToken || process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is not configured.');
  const separator = path.includes('?') ? '&' : '?';
  const url = `${VERCEL_API}${path}${teamQuery(token) && !path.includes('teamId=') ? separator + teamQuery(token).slice(1) : ''}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Vercel API ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data as Record<string, unknown>;
}

export async function promoteVercelDeployment(projectIdOrName: string, deploymentId: string, token?: string) {
  return vercel(`/v10/projects/${encodeURIComponent(projectIdOrName)}/promote/${encodeURIComponent(deploymentId)}`, { method: 'POST' }, token);
}

/** List Vercel projects by stable id/name metadata only — never select deploy targets by ambiguous name alone. */
export async function listVercelProjects(limit = 20, token?: string): Promise<Array<{ id: string; name: string; framework: string | null; link: unknown; accountId: string | null }>> {
  const data = await vercel(`/v9/projects?limit=${Math.min(Math.max(limit, 1), 100)}`, {}, token);
  const projects = Array.isArray((data as { projects?: unknown }).projects)
    ? (data as { projects: Array<Record<string, unknown>> }).projects
    : [];
  return projects.map((project) => ({
    id: String(project.id || ''),
    name: String(project.name || ''),
    framework: project.framework ? String(project.framework) : null,
    link: project.link || null,
    accountId: project.accountId ? String(project.accountId) : null,
  })).filter((project) => project.id);
}

export async function getVercelProject(projectId: string, token?: string): Promise<{
  id: string;
  name: string;
  framework: string | null;
  link: unknown;
  targets: unknown;
}> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) {
    throw new Error('Vercel project id is invalid.');
  }
  const data = await vercel(`/v9/projects/${encodeURIComponent(projectId)}`, {}, token);
  return {
    id: String(data.id || projectId),
    name: String(data.name || ''),
    framework: data.framework ? String(data.framework) : null,
    link: data.link || null,
    targets: data.targets || null,
  };
}

export async function getVercelDeployment(deploymentId: string, token?: string): Promise<{
  id: string;
  readyState: string;
  url: string | null;
  inspectorUrl: string | null;
}> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(deploymentId)) {
    throw new Error('Vercel deployment id is invalid.');
  }
  const data = await vercel(`/v13/deployments/${encodeURIComponent(deploymentId)}`, {}, token);
  return {
    id: String(data.id || deploymentId),
    readyState: String(data.readyState || data.status || ''),
    url: data.url ? `https://${String(data.url)}` : null,
    inspectorUrl: data.inspectorUrl ? String(data.inspectorUrl) : null,
  };
}

export async function createHostingExpiredDeployment(projectIdOrName: string, businessName: string, renewUrl: string, token?: string) {
  const safeName = businessName.replace(/[<>&"']/g, '').slice(0, 120) || 'Website';
  const safeRenew = renewUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hosting Expired — ${safeName}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh;display:grid;place-items:center;margin:0;background:#09090b;color:#fafafa}.card{max-width:560px;margin:24px;padding:36px;border:1px solid #27272a;border-radius:20px;background:#18181b;text-align:center;box-shadow:0 20px 60px #0008}h1{font-size:30px;margin:0 0 14px}p{color:#a1a1aa;line-height:1.6}a{display:inline-block;margin-top:18px;padding:13px 20px;border-radius:12px;background:#fff;color:#09090b;text-decoration:none;font-weight:700}</style></head><body><main class="card"><h1>Hosting has expired</h1><p>The hosting period for <strong>${safeName}</strong> has ended. Renew hosting to restore this website.</p><a href="${safeRenew}">Renew Hosting</a></main></body></html>`;
  return vercel('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: projectIdOrName,
      target: 'production',
      files: [{ file: 'index.html', data: html }],
    }),
  }, token);
}
