import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { parseSkillBundleZip } from '@/lib/skills/bundle';
import { MAX_SKILL_BUNDLE_BYTES, validateSkillFileMap } from '@/lib/skills/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Sign in to import a skill.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'skill-import', 10, 3600);
  if (limited) return limited;
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_SKILL_BUNDLE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'Skill ZIP exceeds the 8 MB import limit.' }, { status: 413 });
  }

  let bytes: Uint8Array;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Upload a skill ZIP in the file field.' }, { status: 400 });
    if (file.size > MAX_SKILL_BUNDLE_BYTES) return NextResponse.json({ error: 'Skill ZIP exceeds the 8 MB import limit.' }, { status: 413 });
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'A valid skill ZIP upload is required.' }, { status: 400 });
  }

  let bundle;
  try { bundle = await parseSkillBundleZip(bytes); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Skill ZIP could not be validated.' }, { status: 400 }); }

  const files = validateSkillFileMap(Object.fromEntries(Object.entries(bundle.files).filter(([filePath]) => filePath !== 'SKILL.md')));
  const db = adminSupabase();
  const { data: skill, error: skillError } = await db.from('skills').insert({
    owner_id: auth.user.id,
    name: bundle.name,
    description: bundle.description,
    version: bundle.version,
    enabled: true,
    source: 'user',
  }).select('id,name,description,version,enabled,source').single();
  if (skillError) return NextResponse.json({ error: skillError.code === '23505' ? 'A skill with this name is already installed. Update or remove it before importing another bundle.' : 'Skill could not be installed.' }, { status: skillError.code === '23505' ? 409 : 503 });

  const fileRows = Object.entries({ 'SKILL.md': bundle.files['SKILL.md'], ...files }).map(([path, content]) => ({ skill_id: skill.id, path, content }));
  const { error: fileError } = await db.from('skill_files').insert(fileRows);
  if (fileError) {
    await db.from('skills').delete().eq('id', skill.id).eq('owner_id', auth.user.id);
    return NextResponse.json({ error: 'Skill package files could not be installed.' }, { status: 503 });
  }
  const { error: versionError } = await db.from('skill_versions').insert({
    skill_id: skill.id, owner_id: auth.user.id, version: bundle.version, description: bundle.description, files: bundle.files,
  });
  if (versionError) {
    await db.from('skills').delete().eq('id', skill.id).eq('owner_id', auth.user.id);
    return NextResponse.json({ error: 'Skill version history is unavailable. Apply the skill lifecycle migration and retry.' }, { status: 503 });
  }
  return NextResponse.json({ skill, installation_status: 'installed' }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
