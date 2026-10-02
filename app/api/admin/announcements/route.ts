import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx || !ctx.profile.twofa_verified) {
    return NextResponse.json({ error: 'Owner 2FA access required' }, { status: 403 });
  }

  const db = adminSupabase();
  const { data, error } = await db
    .from('announcements')
    .select('*')
    .order('release_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ announcements: data || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx || !ctx.profile.twofa_verified) {
    return NextResponse.json({ error: 'Owner 2FA access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();

  const db = adminSupabase();

  if (body.id) {
    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) update.title = title || null;
    if (body.description !== undefined) update.description = description || null;
    if (body.version !== undefined) update.version = body.version || null;
    if (body.summary !== undefined) update.summary = body.summary || null;
    if (body.feature_list !== undefined) {
      update.feature_list = Array.isArray(body.feature_list)
        ? body.feature_list
        : String(body.feature_list || '')
            .split(',')
            .map((item: string) => item.trim())
            .filter(Boolean);
    }
    if (body.cta !== undefined) update.cta = body.cta || null;
    if (body.cta_url !== undefined) update.cta_url = body.cta_url || null;
    if (body.status !== undefined) update.status = body.status || 'draft';
    if (body.release_date !== undefined) update.release_date = body.release_date ? new Date(body.release_date).toISOString() : null;

    if (Object.keys(update).length <= 1) {
      return NextResponse.json({ error: 'No valid fields provided for update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('announcements')
      .update(update)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ announcement: data });
  }

  if (!title || !description) {
    return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
  }

  const payload = {
    title,
    version: body.version || null,
    summary: body.summary || null,
    description,
    feature_list: Array.isArray(body.feature_list)
      ? body.feature_list
      : String(body.feature_list || '')
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean),
    cta: body.cta || "Explore What's New",
    cta_url: body.cta_url || '/whats-new',
    status: body.status || 'draft',
    release_date: body.release_date ? new Date(body.release_date).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from('announcements').insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ announcement: data });
}
