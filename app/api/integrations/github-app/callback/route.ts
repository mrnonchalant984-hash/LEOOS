import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { createGitHubAppJwt } from '@/lib/mcp/github-app-auth';
import { sealConnectionConfig } from '@/lib/integrations/customer-connections';

export const runtime = 'nodejs';

function redirect(request: NextRequest, status: string) {
  const target = new URL('/integrations', request.nextUrl.origin);
  target.searchParams.set('oauth', status);
  target.searchParams.set('provider', 'github');
  return NextResponse.redirect(target, { status: 303 });
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state') || '';
  const installationId = request.nextUrl.searchParams.get('installation_id') || '';
  const setupAction = request.nextUrl.searchParams.get('setup_action') || '';
  if (!state || state.length > 300 || !/^\d{1,20}$/.test(installationId) || !['install', 'update'].includes(setupAction)) {
    return redirect(request, 'github_app_invalid_callback');
  }

  const db = adminSupabase();
  const stateHash = createHash('sha256').update(state).digest('hex');
  const { data: stateRow, error: stateError } = await db.from('integration_oauth_states')
    .select('id,user_id,label,metadata')
    .eq('state_hash', stateHash)
    .eq('provider', 'github')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (stateError || !stateRow || stateRow.metadata?.auth_method !== 'github_app_installation') {
    return redirect(request, 'github_app_invalid_or_expired_state');
  }
  const { data: consumed } = await db.from('integration_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('id', stateRow.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();
  if (!consumed) return redirect(request, 'github_app_state_already_used');

  const appId = process.env.GITHUB_APP_ID?.trim() || '';
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim() || '';
  if (!/^\d{1,20}$/.test(appId) || !privateKey) return redirect(request, 'github_app_not_configured');

  try {
    const jwt = createGitHubAppJwt(appId, privateKey);
    const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Braverton-GitHub-App',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return redirect(request, response.status === 404 ? 'github_app_installation_not_found' : 'github_app_verification_failed');
    const installation = await response.json() as {
      id?: number;
      app_id?: number;
      account?: { id?: number; login?: string; type?: string };
      repository_selection?: string;
      permissions?: Record<string, string>;
      suspended_at?: string | null;
    };
    const account = installation.account;
    const permissions = installation.permissions || {};
    const canCreateRepositories = permissions.repository_creation === 'write' || permissions.administration === 'write';
    if (Number(installation.id) !== Number(installationId)
      || Number(installation.app_id) !== Number(appId)
      || !account?.login
      || !Number.isFinite(Number(account.id))
      || installation.suspended_at
      || permissions.contents !== 'write'
      || !canCreateRepositories) {
      return redirect(request, 'github_app_permissions_incomplete');
    }

    // Prove the installation can mint an installation token before marking it verified.
    const tokenResponse = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'Braverton-GitHub-App',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({})) as { token?: string };
    if (!tokenResponse.ok || typeof tokenPayload.token !== 'string' || !tokenPayload.token) {
      return redirect(request, 'github_app_token_exchange_failed');
    }

    const config = {
      auth_method: 'github_app',
      installation_id: installationId,
      account_login: account.login,
      account_id: String(account.id),
      account_type: account.type || 'User',
      repository_selection: installation.repository_selection || 'selected',
    };
    const { error: saveError } = await db.from('user_integrations').upsert({
      user_id: stateRow.user_id,
      provider: 'github',
      label: stateRow.label,
      credential_ciphertext: sealConnectionConfig(config),
      status: 'verified',
      scopes: ['contents:write', 'repository_creation:write'],
      metadata: {
        auth_method: 'github_app',
        account_login: account.login,
        account_id: account.id,
        account_type: account.type || 'User',
        repository_selection: installation.repository_selection || 'selected',
        permissions,
      },
      last_verified_at: new Date().toISOString(),
      last_error_code: null,
    }, { onConflict: 'user_id,provider,label' });
    if (saveError) return redirect(request, 'github_app_save_failed');
    return redirect(request, 'connected');
  } catch {
    return redirect(request, 'github_app_verification_failed');
  }
}
