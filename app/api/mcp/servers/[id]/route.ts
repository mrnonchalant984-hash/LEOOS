import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to manage MCP connections.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'mcp-server-write', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid MCP connection ID is required.' }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== 'boolean') return NextResponse.json({ error: 'Provide an enabled boolean.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('mcp_remote_servers')
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .select('id,enabled')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'The MCP connection could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'MCP connection not found.' }, { status: 404 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to remove MCP connections.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'mcp-server-write', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'A valid MCP connection ID is required.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('mcp_remote_servers')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'The MCP connection could not be removed.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'MCP connection not found.' }, { status: 404 });
  return NextResponse.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
