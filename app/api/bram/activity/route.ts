import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const sessionId = req.nextUrl.searchParams.get('session_id') || '';
  const after = Math.max(0, Number(req.nextUrl.searchParams.get('after')) || 0);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: 'A valid chat session is required.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('bram_tool_events')
    .select('id,tool_name,event_type,status,is_error,created_at')
    .eq('user_id', auth.user.id).eq('session_id', sessionId).gt('id', after)
    .order('id', { ascending: true }).limit(40);
  if (error) return NextResponse.json({ error: 'Bram activity events are unavailable until the activity migration is applied.' }, { status: 503 });
  return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
