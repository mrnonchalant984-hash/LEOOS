import JSZip from 'jszip';
import {
  decodeSkillFileContent,
  encodeSkillFileContent,
  MAX_SKILL_BUNDLE_BYTES,
  MAX_SKILL_FILES,
  normalizeSkillRelativePath,
  skillNameSchema,
  validateSkillFileMap,
  validateSkillMarkdown,
} from './contracts.ts';

const MANIFEST_PATH = '.leonardx-skill.json';
const MAX_ARCHIVE_BYTES = MAX_SKILL_BUNDLE_BYTES;
const MAX_ARCHIVE_ENTRIES = MAX_SKILL_FILES + 3;

export type SkillBundle = {
  name: string;
  version: string;
  description: string;
  files: Record<string, string>;
};

export async function createSkillBundleZip(bundle: SkillBundle) {
  const name = skillNameSchema.parse(bundle.name);
  const files = validateSkillFileMap(Object.fromEntries(Object.entries(bundle.files).filter(([filePath]) => filePath !== 'SKILL.md')));
  const markdown = bundle.files['SKILL.md'];
  if (typeof markdown !== 'string') throw new Error('Skill bundle is missing SKILL.md.');
  const metadata = validateSkillMarkdown(markdown).metadata;
  if (metadata.name !== name || metadata.version !== bundle.version) throw new Error('Skill bundle metadata must match SKILL.md.');

  const zip = new JSZip();
  zip.file(MANIFEST_PATH, JSON.stringify({ format: 'leonardx-skill', formatVersion: 1, name, version: metadata.version, exportedAt: new Date().toISOString() }, null, 2));
  const folder = zip.folder(name);
  if (!folder) throw new Error('Skill bundle could not be created.');
  folder.file('SKILL.md', markdown);
  for (const [filePath, content] of Object.entries(files)) folder.file(filePath, decodeSkillFileContent(content));

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('The compressed skill bundle exceeds the download size limit.');
  return bytes;
}

export async function parseSkillBundleZip(bytes: Uint8Array): Promise<SkillBundle> {
  if (!bytes.byteLength || bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Skill ZIP must be non-empty and no larger than 8 MB.');
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error(`Skill ZIP contains more than ${MAX_ARCHIVE_ENTRIES} entries.`);

  const manifestEntry = zip.file(MANIFEST_PATH);
  if (!manifestEntry) throw new Error('Skill ZIP is missing its LeonardX format manifest.');
  const manifest = JSON.parse(await manifestEntry.async('string')) as Record<string, unknown>;
  if (manifest.format !== 'leonardx-skill' || manifest.formatVersion !== 1) throw new Error('Skill ZIP format is not supported.');
  const name = skillNameSchema.parse(manifest.name);

  let totalBytes = 0;
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.name === MANIFEST_PATH) continue;
    if (entry.name.includes('\\') || entry.name.startsWith('/') || entry.name.includes('\0')) throw new Error('Skill ZIP contains an unsafe path.');
    const mode = typeof entry.unixPermissions === 'string' ? Number.parseInt(entry.unixPermissions, 8) : Number(entry.unixPermissions || 0);
    if ((mode & 0o170000) === 0o120000) throw new Error('Skill ZIP must not contain symbolic links.');
    const prefix = `${name}/`;
    if (!entry.name.startsWith(prefix)) throw new Error('Skill ZIP must contain exactly one skill directory matching its manifest name.');
    const relative = entry.name.slice(prefix.length);
    if (relative !== 'SKILL.md' && normalizeSkillRelativePath(relative) !== relative) throw new Error('Skill ZIP contains an unsupported file path.');
    if (Object.hasOwn(files, relative)) throw new Error('Skill ZIP contains duplicate file paths.');
    const declaredSize = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize);
    if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > MAX_SKILL_BUNDLE_BYTES) throw new Error('Skill ZIP contains an invalid or oversized file.');
    totalBytes += declaredSize;
    if (totalBytes > MAX_SKILL_BUNDLE_BYTES) throw new Error('Skill ZIP expands beyond the 8 MB bundle limit.');
    const content = await entry.async('uint8array');
    if (content.byteLength !== declaredSize) throw new Error('Skill ZIP entry size did not match its directory record.');
    if (relative === 'SKILL.md') {
      files[relative] = new TextDecoder('utf-8', { fatal: true }).decode(content);
    } else {
      files[relative] = encodeSkillFileContent(content);
    }
  }

  const markdown = files['SKILL.md'];
  if (!markdown) throw new Error('Skill ZIP is missing SKILL.md.');
  const metadata = validateSkillMarkdown(markdown).metadata;
  if (metadata.name !== name || metadata.version !== manifest.version) throw new Error('Skill ZIP manifest does not match its SKILL.md metadata.');
  const supportingFiles = validateSkillFileMap(Object.fromEntries(Object.entries(files).filter(([filePath]) => filePath !== 'SKILL.md')));
  return { name, version: metadata.version, description: metadata.description, files: { 'SKILL.md': markdown, ...supportingFiles } };
}
