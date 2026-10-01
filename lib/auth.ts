import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

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

export async function getProfile(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const db = adminSupabase();
  const { data } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data ? { user, profile: data } : null;
}

export function requireOwner(req: NextRequest) {
  return getProfile(req).then(ctx => {
    if (!ctx || ctx.profile.role !== 'owner' || ctx.profile.email?.toLowerCase() !== (process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com').toLowerCase()) return null;
    return ctx;
  });
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
  return { user: userData.user, profile, subscription: subscription || null, features: features || [] };
}
