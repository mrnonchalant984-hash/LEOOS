import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

async function owner(req: NextRequest, id: string) {
  const ctx = await getProfile(req); if (!ctx) return null;
  const { data } = await adminSupabase().from('organizations').select('id').eq('id', id).eq('owner_user_id', ctx.user.id).maybeSingle();
  return data ? ctx : false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const ctx = await owner(req, id);
  if (!ctx) return NextResponse.json({ error: 'Organization owner access required.' }, { status: 403 });
  const body = await req.json().catch(() => ({})); const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''; const role = ['ADMIN', 'DEVELOPER', 'VIEWER'].includes(body.role) ? body.role : 'VIEWER';
  if (!email) return NextResponse.json({ error: 'Member email is required.' }, { status: 400 });
  const db = adminSupabase(); const { data: profile } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'No LeonardX account exists for that email yet.' }, { status: 404 });
  const { data, error } = await db.from('organization_members').upsert({ organization_id: id, user_id: profile.id, role }, { onConflict: 'organization_id,user_id' }).select('organization_id,user_id,role,created_at').single();
  if (error) return NextResponse.json({ error: 'Member could not be added.' }, { status: 500 });
  return NextResponse.json({ member: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const ctx = await owner(req, id);
  if (!ctx) return NextResponse.json({ error: 'Organization owner access required.' }, { status: 403 });
  const userId = req.nextUrl.searchParams.get('user_id'); if (!userId || userId === ctx.user.id) return NextResponse.json({ error: 'A different member user_id is required.' }, { status: 400 });
  const { error } = await adminSupabase().from('organization_members').delete().eq('organization_id', id).eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Member could not be removed.' }, { status: 500 });
  return NextResponse.json({ removed: true });
}
