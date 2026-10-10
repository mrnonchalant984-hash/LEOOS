export const MAX_IDE_FILES = 250;
export const MAX_IDE_FILE_BYTES = 256_000;
export const MAX_IDE_TOTAL_BYTES = 2_000_000;

export function normalizeIdePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240) return null;
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.leo'))) return null;
  if (parts.some(part => /[\u0000-\u001f]/.test(part))) return null;
  return parts.join('/');
}

export function validateIdeFiles(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > MAX_IDE_FILES) return false;
  let totalBytes = 0;
  for (const [path, content] of entries) {
    if (normalizeIdePath(path) !== path || typeof content !== 'string') return false;
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > MAX_IDE_FILE_BYTES) return false;
    totalBytes += bytes;
    if (totalBytes > MAX_IDE_TOTAL_BYTES) return false;
  }
  return true;
}
