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


export type CloudflarePreviewBinaryAsset = { encoding: 'base64'; data: string };
export type CloudflarePreviewFile = string | CloudflarePreviewBinaryAsset;
export const MAX_CLOUDFLARE_WORKER_PREVIEW_BINARY_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CLOUDFLARE_WORKER_PREVIEW_TOTAL_BYTES = 20 * 1024 * 1024;

export type CloudflareWorkerPreviewValidation =
  | { ok: true; files: Record<string, CloudflarePreviewFile>; totalBytes: number; framework: 'static' | 'nextjs' }
  | { ok: false; code: 'invalid_files' | 'unsupported_file' | 'missing_index' | 'too_many_files' | 'file_too_large' | 'sensitive_credential' };

const WORKER_SOURCE_EXTENSIONS = new Set([
  '.css', '.scss', '.sass', '.html', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.md', '.mdx', '.svg', '.txt', '.xml', '.webmanifest', '.yaml', '.yml', '.toml',
]);
const WORKER_BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf']);

function validBinarySignature(extension: string, bytes: Buffer) {
  if (extension === '.png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (extension === '.gif') return bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  if (extension === '.webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (extension === '.avif') return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp' && bytes.toString('ascii', 8, 12).startsWith('avi');
  if (extension === '.ico') return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0;
  if (extension === '.woff') return bytes.toString('ascii', 0, 4) === 'wOFF';
  if (extension === '.woff2') return bytes.toString('ascii', 0, 4) === 'wOF2';
  if (extension === '.ttf') return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0,1,0,0]));
  if (extension === '.otf') return bytes.toString('ascii', 0, 4) === 'OTTO';
  return false;
}

export function validateCloudflareWorkerPreviewFiles(value: unknown): CloudflareWorkerPreviewValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'invalid_files' };
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return { ok: false, code: 'invalid_files' };
  const entries = Object.entries(value);
  if (entries.length === 0) return { ok: false, code: 'invalid_files' };
  if (entries.length > MAX_CLOUDFLARE_PREVIEW_FILES) return { ok: false, code: 'too_many_files' };

  const files: Record<string, CloudflarePreviewFile> = {};
  let totalBytes = 0;
  const normalizedPaths = new Set<string>();
  for (const [filePath, content] of entries) {
    const parts = filePath.split('/');
    if (!filePath || filePath.length > 240 || filePath.replaceAll('\\', '/').replace(/^\.\//, '') !== filePath
      || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)
      || parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.')
        || part === '__proto__' || part === 'constructor' || part === 'prototype')
      || /[\u0000-\u001f]/.test(filePath)) {
      return { ok: false, code: 'invalid_files' };
    }
    const extension = filePath.slice(filePath.lastIndexOf('/') + 1).toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    const normalizedKey = filePath.toLowerCase();
    if (normalizedPaths.has(normalizedKey)) return { ok: false, code: 'invalid_files' };
    normalizedPaths.add(normalizedKey);
    if (typeof content === 'string') {
      if (!WORKER_SOURCE_EXTENSIONS.has(extension)) return { ok: false, code: 'unsupported_file' };
      const bytes = new TextEncoder().encode(content).byteLength;
      if (bytes > MAX_CLOUDFLARE_PREVIEW_FILE_BYTES) return { ok: false, code: 'file_too_large' };
      if (SECRET_PATTERNS.some(pattern => pattern.test(content))) return { ok: false, code: 'sensitive_credential' };
      totalBytes += bytes;
      files[filePath] = content;
    } else if (content && typeof content === 'object' && !Array.isArray(content)
      && (content as CloudflarePreviewBinaryAsset).encoding === 'base64'
      && typeof (content as CloudflarePreviewBinaryAsset).data === 'string'
      && WORKER_BINARY_EXTENSIONS.has(extension)) {
      const encoded = (content as CloudflarePreviewBinaryAsset).data;
      if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return { ok: false, code: 'invalid_files' };
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.length > MAX_CLOUDFLARE_WORKER_PREVIEW_BINARY_FILE_BYTES || !validBinarySignature(extension, bytes)) return { ok: false, code: 'file_too_large' };
      totalBytes += bytes.length;
      files[filePath] = { encoding: 'base64', data: encoded };
    } else {
      return { ok: false, code: 'unsupported_file' };
    }
    if (totalBytes > MAX_CLOUDFLARE_WORKER_PREVIEW_TOTAL_BYTES) return { ok: false, code: 'file_too_large' };
  }

  if (Object.hasOwn(files, 'index.html')) {
    return { ok: true, files, totalBytes, framework: 'static' };
  }

  let packageJson: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(files['package.json'] || '');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) packageJson = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'invalid_files' };
  }
  const dependencies = {
    ...(packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies as Record<string, unknown> : {}),
    ...(packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies as Record<string, unknown> : {}),
  };
  const hasNext = typeof dependencies.next === 'string' && dependencies.next.length > 0;
  const hasAppPage = ['app/page.tsx', 'app/page.jsx', 'app/page.js', 'src/app/page.tsx', 'src/app/page.jsx', 'src/app/page.js'].some(path => Object.hasOwn(files, path));
  const hasAppLayout = ['app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js'].some(path => Object.hasOwn(files, path));
  const hasPagesIndex = ['pages/index.tsx', 'pages/index.jsx', 'pages/index.js', 'src/pages/index.tsx', 'src/pages/index.jsx', 'src/pages/index.js'].some(path => Object.hasOwn(files, path));
  if (hasNext && ((hasAppPage && hasAppLayout) || hasPagesIndex)) {
    return { ok: true, files, totalBytes, framework: 'nextjs' };
  }
  return { ok: false, code: 'missing_index' };
}

export function getCloudflarePreviewWorkerName(prefix: string, projectId: string) {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'braverton-preview';
  const suffix = projectId.replaceAll('-', '').toLowerCase().slice(0, 16);
  return (safePrefix + '-' + suffix).slice(0, 63);
}

export function isVerifiedCloudflareWorkerPreviewUrl(value: unknown, workerName: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const labels = url.hostname.toLowerCase().split('.');
    return url.protocol === 'https:'
      && labels.length === 4
      && labels[0] === workerName.toLowerCase()
      && /^[a-z0-9-]{1,63}$/.test(labels[1])
      && labels[2] === 'workers'
      && labels[3] === 'dev'
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
