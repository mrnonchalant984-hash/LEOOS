import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { generateApiKey, parseScopes } from '@/lib/api-keys-core';
import { hashSecret } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { data, error } = await adminSupabase().from('api_keys').select('id,name,prefix,scopes,revoked,expires_at,last_used_at,created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'API keys could not be loaded' }, { status: 500 });
  return NextResponse.json({ keys: data || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
  const parsedScopes = parseScopes(body.scopes);
  const scopes = parsedScopes.length ? parsedScopes : ['read'];
  const expiresAt = typeof body.expires_at === 'string' && !Number.isNaN(Date.parse(body.expires_at)) ? new Date(body.expires_at).toISOString() : null;
  if (expiresAt && new Date(expiresAt) <= new Date()) return NextResponse.json({ error: 'Expiry must be in the future' }, { status: 400 });
  const generated = generateApiKey();
  const { data, error } = await adminSupabase().from('api_keys').insert({ user_id: ctx.user.id, name, prefix: generated.prefix, key_hash: hashSecret(generated.raw), scopes, expires_at: expiresAt }).select('id,name,prefix,scopes,revoked,expires_at,created_at').single();
  if (error) return NextResponse.json({ error: 'API key could not be created' }, { status: 500 });
  return NextResponse.json({ key: data, secret: generated.raw, warning: 'Store this secret securely. It will not be shown again.' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Key id is required' }, { status: 400 });
  const { data, error } = await adminSupabase().from('api_keys').update({ revoked: true }).eq('id', id).eq('user_id', ctx.user.id).eq('revoked', false).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'API key could not be revoked' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'API key not found or already revoked' }, { status: 404 });
  return NextResponse.json({ revoked: true, id: data.id });
}
