import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { createSkillBundleZip } from '@/lib/skills/bundle';
import { encodeSkillFileContent, normalizeSkillRelativePath, skillNameSchema, validateSkillMarkdown, MAX_SKILL_BUNDLE_BYTES, MAX_SKILL_FILES } from '@/lib/skills/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readBuiltinBundle(name: string) {
  const root = path.join(process.cwd(), 'skills', name);
  const files: Record<string, string> = {};
  let totalBytes = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) throw new Error('Built-in skill contains a symbolic link and cannot be exported.');
      if (entry.isDirectory()) { await visit(absolute); continue; }
      if (!entry.isFile() || (relative !== 'SKILL.md' && !normalizeSkillRelativePath(relative))) continue;
      const bytes = await readFile(absolute);
      totalBytes += bytes.byteLength;
      if (Object.keys(files).length >= MAX_SKILL_FILES + 1 || totalBytes > MAX_SKILL_BUNDLE_BYTES) throw new Error('Skill bundle exceeds its export size limit.');
      files[relative] = relative === 'SKILL.md'
        ? new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        : encodeSkillFileContent(bytes);
    }
  };
  await visit(root);
  if (!files['SKILL.md']) return null;
  const metadata = validateSkillMarkdown(files['SKILL.md']).metadata;
  return { ...metadata, files };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Sign in to export a skill.' }, { status: 401 });
  let name: string;
  try { name = skillNameSchema.parse((await params).name); }
  catch { return NextResponse.json({ error: 'Skill not found.' }, { status: 404 }); }

  try {
    const builtin = await readBuiltinBundle(name).catch(error => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    });
    let bundle = builtin;
    if (!bundle) {
      const db = adminSupabase();
      const { data: skill, error } = await db.from('skills').select('id,name,description,version')
        .eq('name', name).eq('owner_id', auth.user.id).maybeSingle();
      if (error) return NextResponse.json({ error: 'Skill could not be loaded for export.' }, { status: 503 });
      if (!skill) return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
      const { data: rows, error: filesError } = await db.from('skill_files').select('path,content,storage_url')
        .eq('skill_id', skill.id).order('path');
      if (filesError) return NextResponse.json({ error: 'Skill files could not be loaded for export.' }, { status: 503 });
      const files: Record<string, string> = {};
      for (const row of rows || []) {
        if (typeof row.content !== 'string') return NextResponse.json({ error: 'A stored skill asset cannot be exported because it is not available as private file content.' }, { status: 422 });
        files[row.path] = row.content;
      }
      bundle = { name: skill.name, description: skill.description, version: skill.version, files };
    }
    const bytes = await createSkillBundleZip(bundle);
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${bundle.name}-${bundle.version}.zip"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Skill bundle export failed', { userId: auth.user.id, skillName: name, error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Skill bundle export failed.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
}
