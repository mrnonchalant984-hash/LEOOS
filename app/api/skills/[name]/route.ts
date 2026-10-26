import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { loadSkill, readSkillFile, skillNameSchema } from '@/lib/skills/registry';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view this skill.' }, { status: 401 });
  const { name } = await params;
  try {
    const skill = await loadSkill(skillNameSchema.parse(name), ctx.user.id);
    return NextResponse.json(skill, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Skill not found.' }, { status: 404 }); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to update this skill.' }, { status: 401 });
  const { name } = await params; const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Provide an enabled value.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('skills').update(patch).eq('name', name).eq('owner_id', ctx.user.id).select('id,name,description,version,enabled,source').maybeSingle();
  if (error) return NextResponse.json({ error: 'Skill could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'User skill not found. Built-in skills cannot be edited.' }, { status: 404 });
  return NextResponse.json({ skill: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getProfile(req); if (!ctx) return NextResponse.json({ error: 'Sign in to delete this skill.' }, { status: 401 });
  const { name } = await params;
  const { data, error } = await adminSupabase().from('skills').delete().eq('name', name).eq('owner_id', ctx.user.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Skill could not be deleted.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'User skill not found. Built-in skills cannot be deleted.' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
