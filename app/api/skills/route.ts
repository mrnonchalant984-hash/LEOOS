import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { listSkills, validateSkillMarkdown, skillNameSchema } from '@/lib/skills/registry';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view skills.' }, { status: 401 });
  return NextResponse.json({ skills: await listSkills(ctx.user.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to create a skill.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Skill payload is required.' }, { status: 400 });
  try {
    const name = skillNameSchema.parse(body.name);
    const markdown = String(body.markdown || '');
    const parsed = validateSkillMarkdown(markdown);
    if (parsed.metadata.name !== name) return NextResponse.json({ error: 'Skill name must match SKILL.md frontmatter.' }, { status: 400 });
    const db = adminSupabase();
    const { data: skill, error } = await db.from('skills').insert({ owner_id: ctx.user.id, name, description: parsed.metadata.description, version: parsed.metadata.version, enabled: true, source: 'user' }).select('id,name,description,version,enabled,source').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A skill with this name already exists.' : 'Skill could not be saved.' }, { status: error.code === '23505' ? 409 : 503 });
    const { error: fileError } = await db.from('skill_files').insert({ skill_id: skill.id, path: 'SKILL.md', content: markdown });
    if (fileError) { await db.from('skills').delete().eq('id', skill.id).eq('owner_id', ctx.user.id); return NextResponse.json({ error: 'Skill instructions could not be saved.' }, { status: 503 }); }
    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid skill.' }, { status: 400 }); }
}
