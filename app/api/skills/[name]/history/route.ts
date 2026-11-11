import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { skillNameSchema } from '@/lib/skills/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Sign in to view skill history.' }, { status: 401 });
  let name: string;
  try { name = skillNameSchema.parse((await params).name); }
  catch { return NextResponse.json({ error: 'Skill not found.' }, { status: 404 }); }
  const db = adminSupabase();
  const { data: skill, error: skillError } = await db.from('skills').select('id,name')
    .eq('name', name).eq('owner_id', auth.user.id).maybeSingle();
  if (skillError) return NextResponse.json({ error: 'Skill could not be loaded.' }, { status: 503 });
  if (!skill) return NextResponse.json({ error: 'User skill history was not found.' }, { status: 404 });
  const version = req.nextUrl.searchParams.get('version');
  let query = db.from('skill_versions').select(version ? 'version,description,files,created_at' : 'version,description,created_at')
    .eq('skill_id', skill.id).eq('owner_id', auth.user.id).order('created_at', { ascending: false });
  if (version) query = query.eq('version', version);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Skill version history is unavailable. Apply the skill lifecycle migration.' }, { status: 503 });
  if (version && !data?.length) return NextResponse.json({ error: 'Skill version not found.' }, { status: 404 });
  return NextResponse.json(version ? { version: data?.[0] } : { versions: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
