import { z } from 'zod';

export const skillNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Skill names must use lowercase letters, numbers, and dashes.');
export const skillFrontmatterSchema = z.object({
  name: skillNameSchema,
  description: z.string().trim().min(1).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
});
export type SkillSource = 'builtin' | 'user' | 'plugin';
export type SkillSummary = { name: string; description: string; version: string; source: SkillSource; ownerId?: string; enabled: boolean };

const MAX_MARKDOWN_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SKILL_FILES = 100;
export const MAX_SKILL_BUNDLE_BYTES = 8 * 1024 * 1024;
const BINARY_FILE_PREFIX = 'leonardx:base64:';
const allowedFile = (relative: string) => /^(?:references|assets|scripts)[/\\]/.test(relative);

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

export function normalizeSkillRelativePath(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\0')) return null;
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (normalized.startsWith('/') || segments.some(part => !part || part === '.' || part === '..')) return null;
  if (!allowedFile(normalized)) return null;
  return normalized;
}

export function decodeSkillFileContent(content: string): Uint8Array {
  if (!content.startsWith(BINARY_FILE_PREFIX)) return Buffer.from(content, 'utf8');
  const encoded = content.slice(BINARY_FILE_PREFIX.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Skill binary asset has an invalid encoding.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Skill binary asset has an invalid encoding.');
  return bytes;
}

export function encodeSkillFileContent(bytes: Uint8Array): string {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!bytes.includes(0) && !decoded.includes('\uFFFD')) return decoded;
  return `${BINARY_FILE_PREFIX}${Buffer.from(bytes).toString('base64')}`;
}

export function validateSkillFileMap(files: unknown) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Skill files must be a path-to-content map.');
  const entries = Object.entries(files);
  if (entries.length > MAX_SKILL_FILES) throw new Error(`A skill bundle can contain no more than ${MAX_SKILL_FILES} supporting files.`);
  const normalized: Record<string, string> = {};
  let totalBytes = 0;
  for (const [rawPath, rawContent] of entries) {
    const relative = normalizeSkillRelativePath(rawPath);
    if (!relative || relative !== rawPath) throw new Error(`Skill file path is not allowed: ${rawPath.slice(0, 80)}.`);
    if (typeof rawContent !== 'string') throw new Error('Skill file content must be text or a base64 encoded binary asset.');
    const bytes = decodeSkillFileContent(rawContent);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`Skill file exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SKILL_BUNDLE_BYTES) throw new Error(`Skill files exceed the ${MAX_SKILL_BUNDLE_BYTES / 1024 / 1024} MB bundle limit.`);
    normalized[relative] = rawContent;
  }
  return normalized;
}
