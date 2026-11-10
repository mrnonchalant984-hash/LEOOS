export const MAX_CLOUDFLARE_PREVIEW_FILES = 250;
export const MAX_CLOUDFLARE_PREVIEW_FILE_BYTES = 256_000;
export const MAX_CLOUDFLARE_PREVIEW_TOTAL_BYTES = 2_000_000;
export const MAX_CLOUDFLARE_PREVIEWS_PER_USER_PER_DAY = 3;
export const MAX_CLOUDFLARE_PREVIEWS_PER_ACCOUNT_PER_30_DAYS = 400;

const STATIC_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt',
  '.webmanifest', '.xml',
]);

export type StaticPreviewValidation =
  | { ok: true; files: Record<string, string>; totalBytes: number }
  | { ok: false; code: 'invalid_files' | 'unsupported_file' | 'missing_index' | 'too_many_files' | 'file_too_large' | 'sensitive_credential' };

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\b(?:sk|rk)_(?:live|prod)_[A-Za-z0-9_-]{16,}\b/,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?[^"' \r\n]{12,}/i,
];

export function validateStaticPreviewFiles(value: unknown): StaticPreviewValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'invalid_files' };
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return { ok: false, code: 'invalid_files' };
  const entries = Object.entries(value);
  if (entries.length > MAX_CLOUDFLARE_PREVIEW_FILES) return { ok: false, code: 'too_many_files' };

  const files: Record<string, string> = {};
  let totalBytes = 0;
  const normalizedPaths = new Set<string>();
  for (const [filePath, content] of entries) {
    const parts = filePath.split('/');
    if (!filePath || filePath.length > 240 || filePath.replaceAll('\\', '/').replace(/^\.\//, '') !== filePath
      || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)
      || parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.')
        || part === '__proto__' || part === 'constructor' || part === 'prototype')
      || /[\u0000-\u001f]/.test(filePath) || typeof content !== 'string') {
      return { ok: false, code: 'invalid_files' };
    }

    const fileName = filePath.slice(filePath.lastIndexOf('/') + 1);
    const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    if (!STATIC_EXTENSIONS.has(extension)) return { ok: false, code: 'unsupported_file' };

    const normalizedKey = filePath.toLowerCase();
    if (normalizedPaths.has(normalizedKey)) return { ok: false, code: 'invalid_files' };
    normalizedPaths.add(normalizedKey);
    files[filePath] = content;

    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > MAX_CLOUDFLARE_PREVIEW_FILE_BYTES) return { ok: false, code: 'file_too_large' };
    if (SECRET_PATTERNS.some(pattern => pattern.test(content))) return { ok: false, code: 'sensitive_credential' };
    totalBytes += bytes;
    if (totalBytes > MAX_CLOUDFLARE_PREVIEW_TOTAL_BYTES) return { ok: false, code: 'file_too_large' };
  }

  if (!Object.hasOwn(value, 'index.html')) return { ok: false, code: 'missing_index' };
  return { ok: true, files, totalBytes };
}

export function isCloudflarePagesProjectName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(value);
}

export function isVerifiedCloudflarePreviewUrl(value: unknown, branch: string, projectName: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === `${branch}.${projectName}.pages.dev`
      && !url.port
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}
