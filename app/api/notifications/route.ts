import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const db = adminSupabase();

  if (body.mark === 'all') {
    const { error } = await db.from('notifications').update({ read: true }).eq('user_id', ctx.user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Notification id required' }, { status: 400 });
  }

  const { error } = await db
    .from('notifications')
    .update({ read: true })
    .in('id', ids)
    .eq('user_id', ctx.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
