import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to disconnect a service.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'customer-integration-write', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid connection ID.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('user_integrations').delete().eq('id', id).eq('user_id', ctx.user.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Connection could not be removed.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  return NextResponse.json({ disconnected: true }, { headers: { 'Cache-Control': 'no-store' } });
}
