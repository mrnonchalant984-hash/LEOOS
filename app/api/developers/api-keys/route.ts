import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { generateApiKey, parseScopes } from '@/lib/api-keys-core';
import { hashSecret } from '@/lib/api-security';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getApiPlan } from '@/lib/api-plan-catalog';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'api-key-read', 30, 60);
  if (limited) return limited;
  const { data, error } = await adminSupabase().from('api_keys').select('id,name,prefix,scopes,revoked,expires_at,last_used_at,created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'API keys could not be loaded' }, { status: 500 });
  return NextResponse.json({ keys: data || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'api-key-write', 10, 60);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const rotateId = typeof body.rotate_id === 'string' ? body.rotate_id : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
  const parsedScopes = parseScopes(body.scopes);
  const scopes = parsedScopes.length ? parsedScopes : ['read'];
  const expiresAt = typeof body.expires_at === 'string' && !Number.isNaN(Date.parse(body.expires_at)) ? new Date(body.expires_at).toISOString() : null;
  // Free accounts can prepare credentials before paying; paid plans raise the key quota.
  const db = adminSupabase();
  const { data: activePlan, error: planError } = await db.from('api_plan_subscriptions')
    .select('plan_key').eq('user_id', ctx.user.id).eq('status', 'active').gt('current_period_end', new Date().toISOString())
    .order('current_period_end', { ascending: false }).limit(1).maybeSingle();
  if (planError) return NextResponse.json({ error: 'API plan status could not be checked. Please try again.' }, { status: 503 });
  const entitlements = activePlan ? getApiPlan(activePlan.plan_key) : null;
  const maxKeys = entitlements && 'maxKeys' in entitlements ? entitlements.maxKeys : 2;
  const { count: activeKeyCount, error: countError } = await db.from('api_keys').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id).eq('revoked', false);
  if (countError) return NextResponse.json({ error: 'API key limits could not be checked. Please try again.' }, { status: 503 });
  const isRotatingActiveKey = Boolean(rotateId);
  if ((activeKeyCount ?? 0) >= maxKeys && !isRotatingActiveKey) return NextResponse.json({ error: `Your current plan allows up to ${maxKeys} active API keys. Revoke a key or choose a higher plan.` }, { status: 409 });
  if (expiresAt && new Date(expiresAt) <= new Date()) return NextResponse.json({ error: 'Expiry must be in the future' }, { status: 400 });
  const generated = generateApiKey();
  const { data, error } = await db.from('api_keys').insert({ user_id: ctx.user.id, name, prefix: generated.prefix, key_hash: hashSecret(generated.raw), scopes, expires_at: expiresAt }).select('id,name,prefix,scopes,revoked,expires_at,created_at').single();
  if (error) return NextResponse.json({ error: 'API key could not be created' }, { status: 500 });
  if (rotateId) {
    const { data: revoked, error: revokeError } = await db.from('api_keys').update({ revoked: true }).eq('id', rotateId).eq('user_id', ctx.user.id).eq('revoked', false).select('id').maybeSingle();
    if (revokeError || !revoked) {
      await db.from('api_keys').update({ revoked: true }).eq('id', data.id).eq('user_id', ctx.user.id);
      return NextResponse.json({ error: 'The old key could not be rotated. No new active key was left behind.' }, { status: revokeError ? 500 : 404 });
    }
  }
  return NextResponse.json({ key: data, secret: generated.raw, warning: 'Store this secret securely. It will not be shown again.' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'api-key-write', 10, 60);
  if (limited) return limited;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Key id is required' }, { status: 400 });
  const { data, error } = await adminSupabase().from('api_keys').update({ revoked: true }).eq('id', id).eq('user_id', ctx.user.id).eq('revoked', false).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'API key could not be revoked' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'API key not found or already revoked' }, { status: 404 });
  return NextResponse.json({ revoked: true, id: data.id });
}
