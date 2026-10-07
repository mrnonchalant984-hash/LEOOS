import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

async function sha256(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const AUTH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

function getBearer(req: NextRequest) {
  const header = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header || req.cookies.get('leo_access_token')?.value || null;
}

export async function getUserFromRequest(req: NextRequest) {
  const token = getBearer(req);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await client.auth.getUser(token);
  if (data.user) return data.user;
  const refreshToken = req.cookies.get('leo_refresh_token')?.value;
  if (!refreshToken) return null;
  const refreshed = await client.auth.refreshSession({ refresh_token: refreshToken });
  return refreshed.data.user || null;
}

export const getAdminSupabase = () => adminSupabase();

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function isPlatformOwner(profile: { role?: string | null; email?: string | null } | null | undefined) {
  const ownerEmail = (process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com').toLowerCase();
  return profile?.role === 'owner' && profile.email?.toLowerCase() === ownerEmail;
}

export async function getProfile(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const db = adminSupabase();
  const { data } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data ? { user, profile: data } : null;
}

export async function isTrustedAdminDevice(req: NextRequest, userId: string, db = adminSupabase()) {
  const token = req.cookies.get('leo_admin_device')?.value;
  if (!token) return false;
  try {
    const [tokenHash, userAgentHash] = await Promise.all([
      sha256(token),
      sha256(req.headers.get('user-agent') || 'unknown'),
    ]);
    const { data: device } = await db.from('admin_trusted_devices')
      .select('id,expires_at,user_agent_hash')
      .eq('user_id', userId)
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (!device || new Date(device.expires_at) <= new Date()) return false;
    if (device.user_agent_hash && device.user_agent_hash !== userAgentHash) return false;
    await db.from('admin_trusted_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id);
    return true;
  } catch {
    return false;
  }
}

export async function requireOwner(req: NextRequest, options: { allowUntrustedForSetup?: boolean } = {}) {
  const ctx = await getProfile(req);
  if (!ctx || !isPlatformOwner(ctx.profile)) return null;
  if (ctx.profile.twofa_verified && !options.allowUntrustedForSetup && !await isTrustedAdminDevice(req, ctx.user.id)) return null;
  return ctx;
}

export async function getUserAccess() {
  const jar = await cookies();
  const token = jar.get('leo_access_token')?.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData } = await client.auth.getUser(token);
  if (!userData.user) return null;
  const db = adminSupabase();
  const [{ data: profile }, { data: subscription }, { data: features }] = await Promise.all([
    db.from('profiles').select('*').eq('id', userData.user.id).maybeSingle(),
    db.from('subscriptions').select('*').eq('user_id', userData.user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('feature_access').select('*').eq('user_id', userData.user.id).eq('has_access', true)
  ]);
  const subscriptionEnd = subscription?.ends_at || subscription?.current_period_end;
  const activeSubscription = subscription && (!subscriptionEnd || new Date(subscriptionEnd) > new Date()) ? subscription : null;
  const activeFeatures = (features || []).filter(feature => !feature.expires_at || new Date(feature.expires_at) > new Date());
  return { user: userData.user, profile, subscription: activeSubscription, features: activeFeatures };
}
