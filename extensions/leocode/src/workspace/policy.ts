const EXCLUDED_SEGMENTS = new Set([
  '.git',
  '.next',
  '.venv',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'venv',
]);

const SENSITIVE_FILE = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;
const SENSITIVE_DIRECTORY = /(^|\/)(\.aws|\.kube|\.docker|\.ssh|\.env(?:\..*)?)(\/|$)/i;
const SECRET_ASSIGNMENT = /((?:api[_-]?key|secret|token|password|client[_-]?secret|private[_-]?key|service[_-]?role)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;

export function normalizeWorkspacePath(filePath: string): string | undefined {
  if (!filePath || filePath.includes('\0')) return undefined;
  const normalized = filePath.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return undefined;
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes(':'))) return undefined;
  const result = segments.join('/');
  return isSafeWorkspacePath(result) ? result : undefined;
}

export function isSafeWorkspacePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.includes('\0')) return false;
  const segments = normalized.split('/');
  return !segments.some(segment => !segment || segment === '.' || segment === '..' || EXCLUDED_SEGMENTS.has(segment.toLowerCase()))
    && !/(^|\/)(\.aws\/credentials|\.kube\/config|\.docker\/config\.json|\.ssh)(\/|$)/i.test(normalized)
    && !SENSITIVE_DIRECTORY.test(normalized)
    && !SENSITIVE_FILE.test(normalized);
}

export function redactWorkspaceText(value: string): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private key redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(SECRET_ASSIGNMENT, '$1[redacted]');
}
