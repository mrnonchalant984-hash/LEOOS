import { decryptMcpCredential, encryptMcpCredential } from '@/lib/mcp/outbound-security';

export const CUSTOMER_PROVIDERS = [
  'github', 'vercel', 'supabase', 'firebase', 'openai', 'anthropic',
  'google_gemini', 'whatsapp_business', 'meta', 'youtube', 'custom_mcp',
] as const;
export type CustomerProvider = typeof CUSTOMER_PROVIDERS[number];
export type CustomerConnectionConfig = Record<string, string>;

export function isCustomerProvider(value: unknown): value is CustomerProvider {
  return typeof value === 'string' && CUSTOMER_PROVIDERS.includes(value as CustomerProvider);
}

const CAPABILITY_CATALOG: Record<CustomerProvider, { id: string; label: string; requiredScopes: string[] }[]> = {
  github: [{ id: 'repositories', label: 'Repository access', requiredScopes: ['repo'] }],
  vercel: [{ id: 'deployments', label: 'Projects and deployments', requiredScopes: [] }],
  supabase: [{ id: 'projects', label: 'Project management', requiredScopes: [] }],
  firebase: [{ id: 'firebase-projects', label: 'Firebase project access', requiredScopes: ['https://www.googleapis.com/auth/firebase'] }],
  openai: [{ id: 'models', label: 'Model inventory', requiredScopes: [] }],
  anthropic: [{ id: 'models', label: 'Model inventory', requiredScopes: [] }],
  google_gemini: [{ id: 'models', label: 'Model inventory', requiredScopes: [] }],
  whatsapp_business: [{ id: 'whatsapp-messaging', label: 'WhatsApp messaging', requiredScopes: ['whatsapp_business_messaging'] }],
  meta: [{ id: 'pages-insights', label: 'Page insights', requiredScopes: ['pages_read_engagement', 'read_insights'] }],
  youtube: [{ id: 'youtube-analytics', label: 'YouTube analytics', requiredScopes: ['https://www.googleapis.com/auth/yt-analytics.readonly'] }],
  custom_mcp: [{ id: 'mcp-tools', label: 'MCP tool discovery', requiredScopes: [] }],
};

export function getCustomerProviderCapabilities(provider: CustomerProvider, scopes: readonly string[], verified: boolean) {
  const granted = new Set(scopes);
  return CAPABILITY_CATALOG[provider].map(capability => {
    const missingScopes = capability.requiredScopes.filter(scope => !granted.has(scope));
    const status = !verified ? 'unverified' as const
      : missingScopes.length ? 'permission_review' as const
        : capability.requiredScopes.length ? 'scope_granted' as const : 'provider_verified_only' as const;
    return { id: capability.id, label: capability.label, status, missingScopes };
  });
}

export function validateConnectionConfig(provider: CustomerProvider, config: unknown): CustomerConnectionConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Connection configuration must be an object.');
  const result: CustomerConnectionConfig = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key) || typeof value !== 'string' || value.length > 12000) {
      throw new Error('Connection configuration contains an invalid field.');
    }
    result[key] = value.trim();
  }
  const requireFields = (fields: string[]) => {
    const missing = fields.filter(field => !result[field]);
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}.`);
  };
  if (provider === 'github' || provider === 'vercel') requireFields(['token']);
  if (provider === 'openai' || provider === 'anthropic') requireFields(['api_key']);
  if (provider === 'supabase') {
    requireFields(['project_url', 'access_token']);
    let url: URL;
    try { url = new URL(result.project_url); } catch { throw new Error('Enter a valid Supabase project URL.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Supabase project URL must be an HTTPS *.supabase.co URL.');
  }
  if (provider === 'firebase') requireFields(['project_id', 'access_token']);
  if (provider === 'google_gemini') requireFields(['api_key']);
  if (provider === 'whatsapp_business') requireFields(['access_token', 'phone_number_id']);
  if (provider === 'meta') requireFields(['access_token']);
  if (provider === 'youtube') requireFields(['access_token']);
  if (provider === 'custom_mcp') {
    requireFields(['endpoint_url']);
    let url: URL;
    try { url = new URL(result.endpoint_url); } catch { throw new Error('Enter a valid MCP endpoint URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Custom MCP endpoints must use HTTPS without embedded credentials or fragments.');
  }
  return result;
}

export function sealConnectionConfig(config: CustomerConnectionConfig) {
  return encryptMcpCredential(JSON.stringify(config));
}
export function openConnectionConfig(ciphertext: string): CustomerConnectionConfig {
  const parsed: unknown = JSON.parse(decryptMcpCredential(ciphertext));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored integration credentials are invalid.');
  return parsed as CustomerConnectionConfig;
}

export async function verifyCustomerConnection(provider: CustomerProvider, config: CustomerConnectionConfig) {
  const headers = new Headers({ 'User-Agent': 'LeonardX-Integration-Check', Accept: 'application/json' });
  let url = '';
  if (provider === 'github') { url = 'https://api.github.com/user'; headers.set('Authorization', `Bearer ${config.token}`); }
  else if (provider === 'vercel') { url = 'https://api.vercel.com/v2/user'; headers.set('Authorization', `Bearer ${config.token}`); }
  else if (provider === 'supabase') {
    const projectRef = new URL(config.project_url).hostname.split('.')[0];
    url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}`;
    headers.set('Authorization', `Bearer ${config.access_token}`);
  } else if (provider === 'google_gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models'; headers.set('x-goog-api-key', config.api_key);
  } else if (provider === 'firebase' || provider === 'youtube') {
    url = 'https://www.googleapis.com/oauth2/v3/userinfo'; headers.set('Authorization', `Bearer ${config.access_token}`);
  } else if (provider === 'meta' || provider === 'whatsapp_business') {
    url = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/me?fields=id,name`; headers.set('Authorization', `Bearer ${config.access_token}`);
  } else if (provider === 'custom_mcp') {
    return { status: 'configured' as const, message: 'Endpoint saved. Run MCP tool discovery and approve tools in the MCP manager before use.' };
  }
  const response = await fetch(url, { method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) {
    const status = response.status;
    return { status: 'verification_failed' as const, code: `HTTP_${status}`, message: status === 401 || status === 403 ? 'The credential was rejected or lacks the required permission.' : `Provider verification returned HTTP ${status}.` };
  }
  const providerScopes = response.headers.get('x-oauth-scopes')
    || response.headers.get('x-oauth-granted-scopes')
    || config.scope
    || '';
  return {
    status: 'verified' as const,
    message: 'The provider accepted the credential for the provider-specific verification request.',
    scopes: providerScopes.split(/[ ,]+/).filter(Boolean).slice(0, 40),
  };
}
