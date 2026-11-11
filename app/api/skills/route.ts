import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { listSkills, validateSkillFileMap, validateSkillMarkdown, skillNameSchema } from '@/lib/skills/registry';

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
    const markdown = String(body.markdown || (typeof body.files?.['SKILL.md'] === 'string' ? body.files['SKILL.md'] : ''));
    const parsed = validateSkillMarkdown(markdown);
    if (parsed.metadata.name !== name) return NextResponse.json({ error: 'Skill name must match SKILL.md frontmatter.' }, { status: 400 });
    const supportingFiles = validateSkillFileMap(body.files && typeof body.files === 'object'
      ? Object.fromEntries(Object.entries(body.files).filter(([filePath]) => filePath !== 'SKILL.md'))
      : {});
    const db = adminSupabase();
    const { data: skill, error } = await db.from('skills').insert({ owner_id: ctx.user.id, name, description: parsed.metadata.description, version: parsed.metadata.version, enabled: true, source: 'user' }).select('id,name,description,version,enabled,source').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A skill with this name already exists.' : 'Skill could not be saved.' }, { status: error.code === '23505' ? 409 : 503 });
    const bundleFiles = [{ skill_id: skill.id, path: 'SKILL.md', content: markdown }, ...Object.entries(supportingFiles).map(([path, content]) => ({ skill_id: skill.id, path, content }))];
    const { error: fileError } = await db.from('skill_files').insert(bundleFiles);
    if (fileError) { await db.from('skills').delete().eq('id', skill.id).eq('owner_id', ctx.user.id); return NextResponse.json({ error: 'Skill files could not be saved.' }, { status: 503 }); }
    const { error: versionError } = await db.from('skill_versions').insert({ skill_id: skill.id, owner_id: ctx.user.id, version: parsed.metadata.version, description: parsed.metadata.description, files: { 'SKILL.md': markdown, ...supportingFiles } });
    if (versionError) { await db.from('skills').delete().eq('id', skill.id).eq('owner_id', ctx.user.id); return NextResponse.json({ error: 'Skill version history is unavailable. Apply the skill lifecycle migration and retry.' }, { status: 503 }); }
    return NextResponse.json({ skill, installation_status: 'installed' }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid skill.' }, { status: 400 }); }
}
