import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const db = adminSupabase();
  const { data: announcements, error } = await db
    .from('announcements')
    .select('*')
    .eq('status', 'published')
    .order('release_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ctx = await getProfile(req);
  if (!ctx) {
    return NextResponse.json({ announcements: announcements || [] });
  }

  const { data: seenRows } = await db
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', ctx.user.id);

  const seenIds = new Set((seenRows || []).map((item) => item.announcement_id));

  return NextResponse.json({
    announcements: (announcements || []).map((item) => ({
      ...item,
      seen: seenIds.has(item.id),
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const announcementId = body.announcement_id;
  if (!announcementId) {
    return NextResponse.json({ error: 'announcement_id required' }, { status: 400 });
  }

  const db = adminSupabase();
  const { error } = await db
    .from('announcement_reads')
    .upsert(
      {
        user_id: ctx.user.id,
        announcement_id: announcementId,
        seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,announcement_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
