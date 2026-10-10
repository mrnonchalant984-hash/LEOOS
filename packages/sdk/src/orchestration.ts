/** Contracts for local/hosted LEO worker coordination. Worktrees are not OS sandboxes. */
export type AgentRole = 'database' | 'ui' | 'api' | 'docs' | 'general';
export type ConflictStrategy = 'disjoint-directory' | 'git-worktree' | 'shared-scratchpad';
export type AgentTask = { id: string; name: string; role: AgentRole; summary: string; baseRef?: string };
export type AgentRunState = 'queued' | 'running' | 'validating' | 'ready-to-merge' | 'merged' | 'failed' | 'cancelled';
export type AgentRunTelemetry = { taskId: string; agent: string; strategy: ConflictStrategy; state: AgentRunState; startedAt: string; updatedAt: string; progress?: number; message?: string };
export type ScratchpadEntry = { id: string; taskId: string; agent: string; createdAt: string; summary: string; changedPaths: string[]; schemaDiff?: string; validation: { status: 'passed' | 'failed' | 'not-run'; checks: string[]; details?: string } };
export type ScratchpadManifest = { version: 1; updatedAt: string; entries: ScratchpadEntry[] };

const ROLE_PATHS: Record<AgentRole, readonly string[]> = {
  database: ['/prisma', '/supabase'],
  ui: ['/components/ui'],
  api: ['/app/api', '/lib/api'],
  docs: ['/docs', '/packages/sdk/README.md'],
  general: [],
};

export function normalizeAgentPath(value: string): string | null {
  if (!value || value.includes('\0') || value.includes(':') || /[\u0000-\u001f]/.test(value)) return null;
  const path = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.leo'))) return null;
  return `/${path}`;
}

export function isAgentPathAllowed(role: AgentRole, value: string): boolean {
  const path = normalizeAgentPath(value);
  if (!path) return false;
  const scopes = ROLE_PATHS[role];
  if (role === 'general') return true;
  return scopes.some(scope => path === scope || path.startsWith(`${scope}/`));
}

export function createScratchpadManifest(entries: ScratchpadEntry[] = []): ScratchpadManifest {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [...entries] };
}

export function validateScratchpadManifest(value: unknown): value is ScratchpadManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<ScratchpadManifest>;
  return manifest.version === 1 && typeof manifest.updatedAt === 'string' && Array.isArray(manifest.entries) && manifest.entries.length <= 500 && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 2_000_000;
}

export function appendScratchpadEntry(manifest: ScratchpadManifest, entry: ScratchpadEntry): ScratchpadManifest {
  if (!validateScratchpadManifest(manifest)) throw new TypeError('Invalid scratchpad manifest');
  if (!entry.id || !entry.taskId || !entry.agent || !entry.summary || entry.summary.length > 2000 || entry.changedPaths.length > 200 || entry.schemaDiff && entry.schemaDiff.length > 20_000 || !['passed', 'failed', 'not-run'].includes(entry.validation.status) || entry.validation.checks.length > 30 || entry.validation.checks.some(check => check.length > 100)) throw new TypeError('Invalid scratchpad entry');
  if (entry.validation.checks.length > 30 || entry.validation.checks.some(check => check.length > 100) || (entry.validation.details?.length || 0) > 2000) throw new TypeError('Invalid scratchpad validation details');
  const safeEntry: ScratchpadEntry = { id: entry.id, taskId: entry.taskId, agent: entry.agent, createdAt: entry.createdAt, summary: entry.summary, changedPaths: entry.changedPaths.map(path => {
    const normalized = normalizeAgentPath(path);
    if (!normalized) throw new TypeError(`Invalid changed path: ${path}`);
    return normalized;
  }), ...(entry.schemaDiff ? { schemaDiff: entry.schemaDiff } : {}), validation: { status: entry.validation.status, checks: [...entry.validation.checks], ...(entry.validation.details ? { details: entry.validation.details } : {}) } };
  return createScratchpadManifest([...manifest.entries.filter(existing => existing.id !== safeEntry.id), safeEntry]);
}
