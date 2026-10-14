import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to the same Leo account on both devices before pairing.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'remote-pairing-claim', 8, 300);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-F0-9]{10}$/.test(code)) return NextResponse.json({ error: 'Enter the 10-character code shown on your other device.' }, { status: 400 });
  const db = adminSupabase();
  const { data: pairing, error } = await db.from('leo_remote_pairings').select('id,user_id,status,expires_at,created_device_name')
    .eq('pairing_code_hash', hash(code)).maybeSingle();
  if (error) { console.error('Remote pairing claim lookup failed:', error.message); return NextResponse.json({ error: 'Remote pairing storage is unavailable. Apply supabase/migrations/20261014160000_remote_pairing_schema_repair.sql to the configured Supabase project.' }, { status: 503 }); }
  if (!pairing || pairing.user_id !== ctx.user.id) return NextResponse.json({ error: 'Code is invalid or belongs to a different account.' }, { status: 404 });
  if (pairing.status !== 'pending' || new Date(pairing.expires_at).getTime() <= Date.now()) {
    if (pairing.status === 'pending') await db.from('leo_remote_pairings').update({ status: 'expired' }).eq('id', pairing.id);
    return NextResponse.json({ error: 'This code has expired or was already used. Generate a new code on the other device.' }, { status: 410 });
  }
  const deviceName = String(body.deviceName || req.headers.get('user-agent') || 'Paired device').replace(/[<>\u0000-\u001f]/g, '').slice(0, 100);
  const { data: claimed, error: claimError } = await db.from('leo_remote_pairings').update({ status: 'paired', paired_device_name: deviceName || 'Paired device', paired_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), pairing_code_hash: `used:${pairing.id}` }).eq('id', pairing.id).eq('user_id', ctx.user.id).eq('status', 'pending').gt('expires_at', new Date().toISOString()).select('id,created_device_name,paired_device_name,paired_at').maybeSingle();
  if (claimError || !claimed) return NextResponse.json({ error: 'Pairing could not be completed. The code may have just been used or expired.' }, { status: 409 });
  return NextResponse.json({ ok: true, pairing: claimed });
}
