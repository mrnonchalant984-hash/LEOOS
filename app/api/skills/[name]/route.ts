import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';
import { loadSkill, skillNameSchema, validateSkillFileMap, validateSkillMarkdown } from '@/lib/skills/registry';

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
  const { name: rawName } = await params;
  let name: string;
  try { name = skillNameSchema.parse(rawName); }
  catch { return NextResponse.json({ error: 'Skill not found.' }, { status: 404 }); }
  const body = await req.json().catch(() => ({}));
  const hasBundleUpdate = typeof body.markdown === 'string' || body.files !== undefined;
  if (hasBundleUpdate) {
    const db = adminSupabase();
    const { data: current, error: readError } = await db.from('skills').select('id,name,description,version,enabled,source')
      .eq('name', name).eq('owner_id', ctx.user.id).maybeSingle();
    if (readError) return NextResponse.json({ error: 'Skill could not be loaded for update.' }, { status: 503 });
    if (!current) return NextResponse.json({ error: 'User skill not found. Built-in skills cannot be edited.' }, { status: 404 });
    const { data: existingFiles, error: filesError } = await db.from('skill_files').select('path,content').eq('skill_id', current.id);
    if (filesError) return NextResponse.json({ error: 'Skill files could not be loaded for update.' }, { status: 503 });
    const oldFiles = Object.fromEntries((existingFiles || []).filter(file => typeof file.content === 'string').map(file => [file.path, file.content as string]));
    const markdown = typeof body.markdown === 'string' ? body.markdown : oldFiles['SKILL.md'];
    if (typeof markdown !== 'string') return NextResponse.json({ error: 'Skill instructions are missing.' }, { status: 422 });
    try {
      const parsed = validateSkillMarkdown(markdown);
      if (parsed.metadata.name !== name) return NextResponse.json({ error: 'Skill name cannot be changed.' }, { status: 400 });
      const sourceFiles = body.files === undefined
        ? Object.fromEntries(Object.entries(oldFiles).filter(([path]) => path !== 'SKILL.md'))
        : Object.fromEntries(Object.entries(body.files || {}).filter(([path]) => path !== 'SKILL.md'));
      const supportingFiles = validateSkillFileMap(sourceFiles);
      const files = { 'SKILL.md': markdown, ...supportingFiles };
      const enabledPatch = typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {};
      if (parsed.metadata.version === current.version && (markdown !== oldFiles['SKILL.md'] || JSON.stringify(supportingFiles) !== JSON.stringify(Object.fromEntries(Object.entries(oldFiles).filter(([path]) => path !== 'SKILL.md'))))) {
        return NextResponse.json({ error: 'Update the semantic version in SKILL.md when changing its contents.' }, { status: 409 });
      }
      const { data: updated, error } = await db.rpc('update_user_skill_bundle', {
        p_owner_id: ctx.user.id,
        p_skill_id: current.id,
        p_version: parsed.metadata.version,
        p_description: parsed.metadata.description,
        p_files: files,
      });
      if (error || !updated) return NextResponse.json({ error: error?.message?.includes('version already exists') ? 'That skill version already contains different content.' : 'Skill update failed. Verify that the skill lifecycle migration is applied.' }, { status: 503 });
      if (Object.keys(enabledPatch).length) {
        const { error: enabledError } = await db.from('skills').update(enabledPatch).eq('id', current.id).eq('owner_id', ctx.user.id);
        if (enabledError) return NextResponse.json({ error: 'Skill files were updated, but enabled status could not be saved.' }, { status: 503 });
      }
      return NextResponse.json({ skill: { ...updated, ...enabledPatch } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid skill update.' }, { status: 400 });
    }
  }
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
