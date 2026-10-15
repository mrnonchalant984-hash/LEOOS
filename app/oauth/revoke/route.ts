import { NextRequest, NextResponse } from 'next/server';
import { hashOpaqueToken } from '@/lib/mcp/oauth';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send OAuth revocation requests as application/x-www-form-urlencoded.' }, { status: 400 });
  }
  const token = form.get('token');
  const clientId = form.get('client_id');
  if (typeof token !== 'string' || !token || typeof clientId !== 'string' || !clientId) {
    return NextResponse.json({ error: 'token and client_id are required.' }, { status: 400 });
  }
  const hint = form.get('token_type_hint');
  const column = hint === 'refresh_token' ? 'refresh_token_hash' : 'access_token_hash';
  const db = adminSupabase();
  const { error } = await db.from('mcp_oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq(column, hashOpaqueToken(token))
    .eq('client_id', clientId)
    .is('revoked_at', null);
  if (error) return NextResponse.json({ error: 'OAuth token revocation is temporarily unavailable.' }, { status: 503 });
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
