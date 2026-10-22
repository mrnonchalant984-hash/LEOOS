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
  if (provider === 'supabase') {
    requireFields(['project_url', 'access_token']);
    let url: URL;
    try { url = new URL(result.project_url); } catch { throw new Error('Enter a valid Supabase project URL.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Supabase project URL must be an HTTPS *.supabase.co URL.');
  }
  if (provider === 'firebase') requireFields(['project_id', 'access_token']);
  if (provider === 'openai' || provider === 'anthropic' || provider === 'google_gemini') requireFields(['api_key']);
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
    url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.api_key)}`;
  } else if (provider === 'firebase' || provider === 'youtube') {
    url = 'https://www.googleapis.com/oauth2/v3/userinfo'; headers.set('Authorization', `Bearer ${config.access_token}`);
  } else if (provider === 'meta' || provider === 'whatsapp_business') {
    url = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/me?fields=id,name`; headers.set('Authorization', `Bearer ${config.access_token}`);
  } else if (provider === 'openai') {
    url = 'https://api.openai.com/v1/models'; headers.set('Authorization', `Bearer ${config.api_key}`);
  } else if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models'; headers.set('x-api-key', config.api_key); headers.set('anthropic-version', '2023-06-01');
  } else if (provider === 'custom_mcp') {
    return { status: 'configured' as const, message: 'Endpoint saved. Run MCP tool discovery and approve tools in the MCP manager before use.' };
  }
  const response = await fetch(url, { method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) {
    const status = response.status;
    return { status: 'verification_failed' as const, code: `HTTP_${status}`, message: status === 401 || status === 403 ? 'The credential was rejected or lacks the required permission.' : `Provider verification returned HTTP ${status}.` };
  }
  return { status: 'verified' as const, message: 'The provider accepted the credential.' };
}
