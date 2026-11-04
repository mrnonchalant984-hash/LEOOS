import * as vscode from 'vscode';

type Session = { access_token: string; refresh_token: string };

export class LeonardXApi {
  private readonly origin: string;
  private refreshInFlight: Promise<string> | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {
    const configured = vscode.workspace.getConfiguration('leocode').get<string>('baseUrl', 'https://leoos-omega.vercel.app');
    const base = new URL(configured);
    const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.protocol !== 'https:' && !localHttp) {
      throw new Error('LeoCode requires HTTPS for non-local LeonardX servers.');
    }
    this.origin = base.origin;
  }

  async signIn(email: string, password: string) {
    const response = await fetch(`${this.origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({})) as { error?: string; session?: Session };
    if (!response.ok || !data.session?.access_token || !data.session.refresh_token) {
      throw new Error(data.error || 'LeonardX sign-in failed.');
    }
    await this.storeSession(data.session);
    return this.request('/api/auth/profile');
  }

  async signOut() {
    await Promise.all([
      this.secrets.delete('leocode.access-token'),
      this.secrets.delete('leocode.refresh-token'),
    ]);
  }

  async request<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid LeonardX API path.');
    let token = await this.accessToken();
    let response = await this.send(path, token, init);
    if (response.status === 401) {
      token = await this.refreshSession(true);
      response = await this.send(path, token, init);
    }
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 401) {
      await this.signOut();
      throw new Error('Your LeonardX session expired. Connect your account again.');
    }
    if (!response.ok) throw new Error(data.error || `LeonardX request failed (${response.status}).`);
    return data as T;
  }

  private async send(path: string, token: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Origin', this.origin);
    return fetch(`${this.origin}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init.signal || AbortSignal.timeout(60_000),
    });
  }

  private async accessToken() {
    const token = await this.secrets.get('leocode.access-token');
    if (!token) throw new Error('Connect a LeonardX account to use LeoCode.');
    const expiresAt = this.jwtExpiry(token);
    if (!expiresAt || expiresAt <= Date.now() + 60_000) return this.refreshSession(false);
    return token;
  }

  private async refreshSession(force: boolean): Promise<string> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const accessToken = await this.secrets.get('leocode.access-token');
      const refreshToken = await this.secrets.get('leocode.refresh-token');
      if (!refreshToken || (!force && accessToken && this.jwtExpiry(accessToken)! > Date.now() + 60_000)) {
        if (accessToken) return accessToken;
        throw new Error('Connect a LeonardX account to use LeoCode.');
      }
      const response = await fetch(`${this.origin}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: this.origin },
        body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; session?: Session };
      if (!response.ok || !data.session?.access_token || !data.session.refresh_token) {
        await this.signOut();
        throw new Error(data.error || 'LeonardX session refresh failed. Connect your account again.');
      }
      await this.storeSession(data.session);
      return data.session.access_token;
    })();
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = undefined;
    }
  }

  private async storeSession(session: Session) {
    await Promise.all([
      this.secrets.store('leocode.access-token', session.access_token),
      this.secrets.store('leocode.refresh-token', session.refresh_token),
    ]);
  }

  private jwtExpiry(token: string) {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: unknown };
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }
}
