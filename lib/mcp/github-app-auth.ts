import { createSign } from 'node:crypto';

const GITHUB_API = 'https://api.github.com';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const JWT_LIFETIME_SECONDS = 9 * 60;

type GitHubAppEnvironment = {
  [key: string]: string | undefined;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
};

type CachedToken = { token: string; expiresAtMs: number };
const installationTokenCache = new Map<string, CachedToken>();

export type GitHubAppConfigurationMode = 'app' | 'fallback';

function readConfig(env: GitHubAppEnvironment) {
  const appId = env.GITHUB_APP_ID?.trim() || '';
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim() || '';
  const installationId = env.GITHUB_APP_INSTALLATION_ID?.trim() || '';
  const configured = [appId, privateKey, installationId].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 3) {
    throw new Error('GitHub App authentication is partially configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID together, or remove all three to use the verified GitHub integration.');
  }
  if (!/^\d{1,20}$/.test(appId) || !/^\d{1,20}$/.test(installationId)) {
    throw new Error('GitHub App authentication configuration is invalid. App ID and installation ID must be numeric IDs, not an OAuth client ID.');
  }
  const normalizedPrivateKey = privateKey.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!normalizedPrivateKey.includes('-----BEGIN') || !normalizedPrivateKey.includes('PRIVATE KEY-----')) {
    throw new Error('GitHub App private-key configuration is invalid. Use the full PEM private key with newline formatting preserved.');
  }
  return { appId, installationId, privateKey: normalizedPrivateKey };
}

export function getGitHubAppConfigurationMode(env: GitHubAppEnvironment = process.env): GitHubAppConfigurationMode {
  return readConfig(env) ? 'app' : 'fallback';
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createGitHubAppJwt(appId: string, privateKey: string, nowMs = Date.now()) {
  if (!/^\d{1,20}$/.test(appId.trim())) throw new Error('GitHub App ID must be a numeric App ID.');
  const normalizedPrivateKey = privateKey.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  const nowSeconds = Math.floor(nowMs / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson({
    iat: nowSeconds - 30,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
    iss: appId.trim(),
  });
  const unsigned = `${header}.${payload}`;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(normalizedPrivateKey, 'base64url')}`;
  } catch {
    throw new Error('GitHub App private key could not be used to sign an authentication token. Check that the PEM key matches this App.');
  }
}

function sanitizedGitHubAuthError(status: number) {
  if (status === 401 || status === 403) return 'GitHub App authentication was rejected. Verify the App ID/private key, installation ID, repository installation, and App permissions.';
  if (status === 404) return 'The GitHub App installation or requested repository was not found or is not accessible to this installation.';
  if (status === 429) return 'GitHub temporarily rate-limited GitHub App authentication. Try again later.';
  if (status >= 500) return 'GitHub is temporarily unavailable while authenticating the App.';
  return `GitHub App authentication failed (HTTP ${status}). Check the App configuration and installation access.`;
}

export type GitHubAppTokenOptions = {
  env?: GitHubAppEnvironment;
  now?: () => number;
  fetcher?: typeof fetch;
};

/**
 * Creates a short-lived App JWT and exchanges it for an installation token
 * scoped to the configured target repository. Credentials and response bodies
 * are deliberately excluded from errors and logs.
 */
export async function getGitHubAppInstallationToken(
  target: { owner: string; repository: string },
  options: GitHubAppTokenOptions = {},
): Promise<string> {
  const env = options.env || process.env;
  const config = readConfig(env);
  if (!config) throw new Error('GitHub App credentials are not configured.');
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(target.owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(target.repository)) {
    throw new Error('The configured main website repository is invalid.');
  }

  const now = options.now || Date.now;
  const fetcher = options.fetcher || fetch;
  const cacheKey = `${config.appId}:${config.installationId}:${target.owner.toLowerCase()}/${target.repository.toLowerCase()}`;
  const cached = installationTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now()) return cached.token;

  const jwt = createGitHubAppJwt(config.appId, config.privateKey, now());
  let response: Response;
  try {
    response = await fetcher(`${GITHUB_API}/app/installations/${encodeURIComponent(config.installationId)}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'LeonardX-MCP',
      },
      body: JSON.stringify({ repository_names: [target.repository] }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not reach GitHub to exchange the App JWT for an installation token.');
  }
  if (!response.ok) throw new Error(sanitizedGitHubAuthError(response.status));

  let payload: unknown;
  try { payload = await response.json(); } catch {
    throw new Error('GitHub returned an invalid installation-token response.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('GitHub returned an invalid installation-token response.');
  }
  const result = payload as { token?: unknown; expires_at?: unknown; repositories?: unknown };
  if (typeof result.token !== 'string' || !result.token || typeof result.expires_at !== 'string') {
    throw new Error('GitHub returned an incomplete installation-token response.');
  }
  const expiresAtMs = Date.parse(result.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now() + TOKEN_REFRESH_SKEW_MS) {
    throw new Error('GitHub returned an installation token that is expired or too close to expiration.');
  }
  installationTokenCache.set(cacheKey, { token: result.token, expiresAtMs });
  return result.token;
}

export async function getMainWebsiteGitHubToken(input: {
  owner: string;
  repository: string;
  fallbackToken?: string | null;
  options?: GitHubAppTokenOptions;
}): Promise<string> {
  const mode = getGitHubAppConfigurationMode(input.options?.env || process.env);
  if (mode === 'app') return getGitHubAppInstallationToken(input, input.options);
  if (input.fallbackToken?.trim()) return input.fallbackToken.trim();
  throw new Error('No GitHub App is configured and no verified GitHub integration token is available. Configure the GitHub App variables or reconnect the owner GitHub integration.');
}
