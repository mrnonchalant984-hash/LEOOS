import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '../auth';
import { normalizeSkillRelativePath, skillNameSchema, validateSkillMarkdown } from './contracts.ts';
import type { SkillSource, SkillSummary } from './contracts.ts';
export { decodeSkillFileContent, encodeSkillFileContent, MAX_SKILL_BUNDLE_BYTES, MAX_SKILL_FILES, normalizeSkillRelativePath, skillFrontmatterSchema, skillNameSchema, validateSkillFileMap, validateSkillMarkdown } from './contracts.ts';
export type { SkillSource, SkillSummary } from './contracts.ts';

const ROOT = path.join(process.cwd(), 'skills');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const allowedFile = (relative: string) => /^(?:references|assets|scripts)[/\\]/.test(relative);

function safeRelative(relative: string) {
  const normalized = relative.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) throw new Error('Skill file path is not allowed.');
  const resolved = path.resolve(ROOT, normalized);
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep) || !allowedFile(normalized.replaceAll('/', path.sep))) throw new Error('Only skill references, assets, and scripts can be read.');
  return { normalized, resolved };
}

async function builtinSummary(): Promise<SkillSummary[]> {
  const entries = await fs.readdir(ROOT, { withFileTypes: true }).catch(() => []);
  const result: SkillSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const markdown = await fs.readFile(path.join(ROOT, entry.name, 'SKILL.md'), 'utf8');
      const { metadata } = validateSkillMarkdown(markdown);
      result.push({ ...metadata, source: 'builtin', enabled: true });
    } catch { /* invalid built-ins are omitted from the advertised registry */ }
  }
  return result;
}

export async function listSkills(userId?: string): Promise<SkillSummary[]> {
  const builtins = await builtinSummary();
  if (!userId) return builtins;
  const { data } = await adminSupabase().from('skills').select('id,name,description,version,enabled,source').eq('owner_id', userId).order('name');
  const owned = (data || []).map(item => ({ name: item.name, description: item.description, version: item.version, source: (item.source === 'plugin' ? 'plugin' : 'user') as SkillSource, ownerId: userId, enabled: item.enabled !== false }));
  const disabled = new Set(owned.filter(item => !item.enabled).map(item => item.name));
  return [...builtins.filter(item => !disabled.has(item.name)), ...owned.filter(item => item.enabled)];
}

export async function loadSkill(name: string, userId?: string) {
  skillNameSchema.parse(name);
  const builtinPath = path.join(ROOT, name, 'SKILL.md');
  try {
    const markdown = await fs.readFile(builtinPath, 'utf8');
    const parsed = validateSkillMarkdown(markdown);
    return { ...parsed.metadata, source: 'builtin' as const, body: parsed.body };
  } catch { /* try owner storage below */ }
  if (!userId) throw new Error('Skill not found or not available to this account.');
  const { data, error } = await adminSupabase().from('skill_files').select('path,content,skill_id,skills!inner(name,description,version,enabled,owner_id)').eq('path', 'SKILL.md').eq('skills.name', name).eq('skills.owner_id', userId).maybeSingle();
  if (error || !data || (data.skills as { enabled?: boolean })?.enabled === false) throw new Error('Skill not found or not available to this account.');
  const parsed = validateSkillMarkdown(String(data.content || ''));
  return { ...parsed.metadata, source: 'user' as const, body: parsed.body };
}

export async function readSkillFile(name: string, relative: string, userId?: string) {
  skillNameSchema.parse(name);
  const { normalized } = safeRelative(relative);
  if (userId) {
    const { data } = await adminSupabase().from('skill_files').select('content,skills!inner(name,owner_id,enabled)').eq('path', normalized).eq('skills.name', name).eq('skills.owner_id', userId).maybeSingle();
    if (data && (data.skills as { enabled?: boolean }).enabled !== false) return String(data.content || '');
  }
  const file = path.join(ROOT, name, normalized);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Skill file is missing or exceeds the size limit.');
  return fs.readFile(file, 'utf8');
}

export function newSkillId() { return randomUUID(); }
