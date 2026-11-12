import type { CustomerConnectionConfig, CustomerProvider } from './customer-connections';

type Verification = {
  status: 'configured' | 'verified' | 'verification_failed';
  message: string;
  code?: string;
  scopes?: string[];
};

function providerUrl(provider: CustomerProvider, config: CustomerConnectionConfig) {
  const graphVersion = process.env.META_GRAPH_VERSION || 'v23.0';
  switch (provider) {
    case 'github': return 'https://api.github.com/user';
    case 'vercel': return 'https://api.vercel.com/v2/user';
    case 'supabase': {
      const url = new URL(config.project_url);
      return `https://api.supabase.com/v1/projects/${encodeURIComponent(url.hostname.split('.')[0])}`;
    }
    case 'firebase': return `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(config.project_id)}`;
    case 'openai': return 'https://api.openai.com/v1/models';
    case 'anthropic': return 'https://api.anthropic.com/v1/models';
    case 'google_gemini': return 'https://generativelanguage.googleapis.com/v1beta/models';
    case 'whatsapp_business': {
      if (!config.phone_number_id) throw new Error('WhatsApp phone-number ID is required for verification.');
      return `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(config.phone_number_id)}?fields=id,verified_name,display_phone_number`;
    }
    case 'meta': return `https://graph.facebook.com/${graphVersion}/me/permissions`;
    case 'youtube': return 'https://youtube.googleapis.com/youtube/v3/channels?part=id&mine=true';
    case 'custom_mcp': return '';
  }
}

function providerHeaders(provider: CustomerProvider, config: CustomerConnectionConfig) {
  const headers = new Headers({ Accept: 'application/json', 'User-Agent': 'LeonardX-Integration-Check' });
  if (provider === 'github' || provider === 'vercel') headers.set('Authorization', `Bearer ${config.token}`);
  if (provider === 'supabase' || provider === 'firebase' || provider === 'youtube' || provider === 'meta' || provider === 'whatsapp_business') {
    headers.set('Authorization', `Bearer ${config.access_token}`);
  }
  if (provider === 'openai') headers.set('Authorization', `Bearer ${config.api_key}`);
  if (provider === 'anthropic') {
    headers.set('x-api-key', config.api_key);
    headers.set('anthropic-version', '2023-06-01');
  }
  if (provider === 'google_gemini') headers.set('x-goog-api-key', config.api_key);
  return headers;
}

export async function verifyProviderCredential(provider: CustomerProvider, config: CustomerConnectionConfig): Promise<Verification> {
  if (provider === 'custom_mcp') {
    return { status: 'configured', message: 'Endpoint saved. Discover tools and approve required capabilities in the MCP manager.' };
  }
  const requiredKey = provider === 'github' || provider === 'vercel' ? 'token'
    : provider === 'openai' || provider === 'anthropic' || provider === 'google_gemini' ? 'api_key'
      : provider === 'supabase' || provider === 'firebase' || provider === 'youtube' || provider === 'meta' || provider === 'whatsapp_business' ? 'access_token'
        : '';
  if (requiredKey && !config[requiredKey]) throw new Error('The saved connection is missing a required credential.');
  const response = await fetch(providerUrl(provider, config), {
    method: 'GET',
    headers: providerHeaders(provider, config),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const status = response.status;
    return {
      status: 'verification_failed',
      code: `HTTP_${status}`,
      message: status === 401 || status === 403
        ? 'The provider rejected the credential or the required permissions are missing.'
        : `Provider verification returned HTTP ${status}.`,
    };
  }
  let responseBody: unknown = null;
  try { responseBody = await response.json(); } catch { /* Some provider endpoints return an empty success body. */ }
  let permissionRows: unknown = responseBody;
  if (provider === 'whatsapp_business') {
    const permissions = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/me/permissions`, {
      method: 'GET',
      headers: providerHeaders('meta', config),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
    if (permissions.ok) {
      try { permissionRows = await permissions.json(); } catch { permissionRows = null; }
    }
  }
  const permissionData = permissionRows && typeof permissionRows === 'object'
    ? (permissionRows as { data?: unknown }).data
    : null;
  const grantedPermissions = Array.isArray(permissionData)
    ? permissionData.flatMap(permission => permission && typeof permission === 'object'
      && (permission as { status?: unknown }).status === 'granted'
      && typeof (permission as { permission?: unknown }).permission === 'string'
      ? [(permission as { permission: string }).permission]
      : [])
    : [];
  const rawScopes = response.headers.get('x-oauth-scopes')
    || response.headers.get('x-oauth-granted-scopes')
    || (grantedPermissions.length ? grantedPermissions.join(' ') : '')
    || config.scope
    || '';
  return {
    status: 'verified',
    message: 'Provider-specific credential verification succeeded.',
    scopes: rawScopes.split(/[ ,]+/).filter(Boolean).slice(0, 40),
  };
}
