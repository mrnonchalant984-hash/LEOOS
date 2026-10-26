import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { adminSupabase } from '../auth';

export const skillNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Skill names must use lowercase letters, numbers, and dashes.');
export const skillFrontmatterSchema = z.object({
  name: skillNameSchema,
  description: z.string().trim().min(1).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
});
export type SkillSource = 'builtin' | 'user' | 'plugin';
export type SkillSummary = { name: string; description: string; version: string; source: SkillSource; ownerId?: string; enabled: boolean };

const ROOT = path.join(process.cwd(), 'skills');
const MAX_MARKDOWN_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const allowedFile = (relative: string) => relative.startsWith('references' + path.sep) || relative.startsWith('assets' + path.sep) || relative.startsWith('scripts' + path.sep);

function parseFrontmatter(markdown: string) {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/m.exec(markdown);
  if (!match) throw new Error('SKILL.md must start with YAML frontmatter.');
  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return { metadata: skillFrontmatterSchema.parse(values), body: match[2].trim() };
}

export function validateSkillMarkdown(markdown: string) {
  if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('SKILL.md is too large. Move long material into references/.');
  const lines = markdown.split(/\r?\n/);
  if (lines.length > 500) throw new Error('SKILL.md must be 500 lines or fewer.');
  return parseFrontmatter(markdown);
}

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

export async function runSkillScript(name: string, script: string, args: string[] = [], userId?: string) {
  skillNameSchema.parse(name);
  if (!/^scripts\/[A-Za-z0-9._-]+\.(py|js)$/.test(script.replaceAll('\\', '/'))) throw new Error('Only .py and .js files inside scripts/ can run.');
  const source = await readSkillFile(name, script, userId);
  if (/fetch\s*\(|https?:\/\/|process\.env|os\.environ|child_process|subprocess|\.\.[/\\]/i.test(source)) throw new Error('This skill script contains a blocked network, secret, or unsafe filesystem pattern.');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'leo-skill-'));
  const output = path.join(temp, 'outputs');
  await fs.mkdir(output);
  const scriptPath = path.join(temp, path.basename(script));
  await fs.writeFile(scriptPath, source, { mode: 0o700 });
  const interpreter = script.endsWith('.py') ? 'python3' : process.execPath;
  const started = Date.now();
  try {
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const child = spawn(interpreter, [scriptPath, ...args.slice(0, 20)], { cwd: temp, env: { PATH: process.env.PATH || '', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] }) as any;
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); if (stdout.length > 100_000) child.kill('SIGKILL'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); if (stderr.length > 50_000) child.kill('SIGKILL'); });
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Skill script exceeded the 60-second limit.')); }, 60_000);
      child.on('error', (error: Error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code: number | null) => { clearTimeout(timer); resolve({ stdout, stderr, code }); });
    });
    const files = await fs.readdir(output).then(async names => Promise.all(names.slice(0, 50).map(async file => ({ path: file, content: (await fs.readFile(path.join(output, file))).toString('base64') }))));
    return { ...result, files, durationMs: Date.now() - started };
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

export function newSkillId() { return randomUUID(); }
