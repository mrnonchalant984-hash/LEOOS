import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function deviceName(req: NextRequest, provided: unknown) {
  const value = typeof provided === 'string' ? provided.trim() : '';
  const fallback = req.headers.get('user-agent')?.slice(0, 100) || 'Unknown device';
  return (value || fallback).replace(/[<>\u0000-\u001f]/g, '').slice(0, 100) || 'Unknown device';
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in before pairing devices.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'remote-pairing-create', 10, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const code = randomBytes(5).toString('hex').toUpperCase();
  const db = adminSupabase();
  const { data, error } = await db.from('leo_remote_pairings').insert({
    user_id: ctx.user.id,
    pairing_code_hash: hash(code),
    created_device_name: deviceName(req, body.deviceName),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    status: 'pending',
  }).select('id,expires_at,created_device_name,status').single();
  if (error || !data) {
    console.error('Remote pairing create failed:', error?.message);
    return NextResponse.json({ error: 'Remote pairing is unavailable. Apply supabase/migrations/20261014160000_remote_pairing_schema_repair.sql to the configured Supabase project, then restart the local app.' }, { status: 503 });
  }
  return NextResponse.json({ pairing: { id: data.id, code, expiresAt: data.expires_at, deviceName: data.created_device_name, status: data.status } }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('leo_remote_pairings')
    .select('id,created_device_name,paired_device_name,status,expires_at,paired_at,last_seen_at,created_at')
    .eq('user_id', ctx.user.id).in('status', ['pending', 'paired']).order('created_at', { ascending: false }).limit(10);
  if (error) { console.error('Remote pairing list failed:', error.message); return NextResponse.json({ error: 'Remote pairing storage is unavailable. Apply supabase/migrations/20261014160000_remote_pairing_schema_repair.sql to the configured Supabase project.' }, { status: 503 }); }
  return NextResponse.json({ pairings: data || [] });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Pairing id is required.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('leo_remote_pairings').update({ status: 'revoked' }).eq('id', id).eq('user_id', ctx.user.id).in('status', ['pending','paired']).select('id').maybeSingle();
  if (error) { console.error('Remote pairing revoke failed:', error.message); return NextResponse.json({ error: 'Remote pairing storage is unavailable. Apply supabase/migrations/20261014160000_remote_pairing_schema_repair.sql to the configured Supabase project.' }, { status: 503 }); }
  if (!data) return NextResponse.json({ error: 'Pairing not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
