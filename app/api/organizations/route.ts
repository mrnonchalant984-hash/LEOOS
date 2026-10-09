import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { data, error } = await adminSupabase().from('organizations').select('id,name,slug,owner_user_id,created_at,organization_members(user_id,role)').or(`owner_user_id.eq.${ctx.user.id},organization_members.user_id.eq.${ctx.user.id}`).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Organizations could not be loaded.' }, { status: 500 });
  return NextResponse.json({ organizations: data || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) : '';
  if (!name || !slug) return NextResponse.json({ error: 'A name and URL-safe slug are required.' }, { status: 400 });
  const db = adminSupabase();
  const { data: org, error } = await db.from('organizations').insert({ name, slug, owner_user_id: ctx.user.id }).select('id,name,slug,owner_user_id,created_at').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That organization slug is already in use.' : 'Organization could not be created.' }, { status: error.code === '23505' ? 409 : 500 });
  const { error: memberError } = await db.from('organization_members').insert({ organization_id: org.id, user_id: ctx.user.id, role: 'OWNER' });
  if (memberError) return NextResponse.json({ error: 'Organization was created but membership setup failed.' }, { status: 500 });
  return NextResponse.json({ organization: org }, { status: 201 });
}
