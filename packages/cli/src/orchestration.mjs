import { execFile as execFileCallback } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);
const roles = {
  database: ['/prisma', '/supabase'],
  ui: ['/components/ui'],
  api: ['/app/api', '/lib/api'],
  docs: ['/docs', '/packages/sdk/README.md'],
};
export const strategies = ['disjoint-directory', 'git-worktree', 'shared-scratchpad'];

export function isPathAllowed(role, input) {
  if (typeof input !== 'string' || input.includes('\0') || input.includes(':')) return false;
  const relativePath = input.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..')) return false;
  const path = `/${relativePath}`;
  if (role === 'general') return true;
  return (roles[role] || []).some(scope => path === scope || path.startsWith(`${scope}/`));
}

function normalizeScratchPath(input) {
  if (typeof input !== 'string' || input.includes('\0') || input.includes(':')) throw new Error('Scratchpad paths must be safe relative paths.');
  const value = input.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!value || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.leo'))) throw new Error('Scratchpad paths must be safe relative paths.');
  return `/${value}`;
}

async function atomicJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temp, file);
}

export async function appendScratchpad(root, entry) {
  const file = join(root, '.leo', 'scratchpad.json');
  const lockPath = join(root, '.leo', 'scratchpad.lock');
  let lock;
  try { await mkdir(dirname(file), { recursive: true }); lock = await open(lockPath, 'wx', 0o600); } catch { throw new Error('Scratchpad is being updated by another worker. Retry after it finishes.'); }
  try {
  let manifest = { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  try {
    manifest = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('Scratchpad is unreadable or invalid JSON.');
  }
  if (manifest.version !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length >= 500) throw new Error('Scratchpad schema or capacity limit is invalid.');
  if (!entry?.id || !entry?.taskId || !entry?.agent || typeof entry.summary !== 'string' || entry.summary.length > 2000 || !Array.isArray(entry.changedPaths) || entry.changedPaths.length > 200 || !entry.validation || !['passed', 'failed', 'not-run'].includes(entry.validation.status) || !Array.isArray(entry.validation.checks) || (entry.schemaDiff?.length || 0) > 20_000) throw new Error('Invalid scratchpad entry.');
  const safeEntry = { ...entry, changedPaths: entry.changedPaths.map(normalizeScratchPath) };
  if (safeEntry.validation.checks.length > 30 || safeEntry.validation.checks.some(check => typeof check !== 'string' || check.length > 100) || (safeEntry.validation.details?.length || 0) > 2000) throw new Error('Scratchpad validation details exceed the allowed limits.');
  const next = { version: 1, updatedAt: new Date().toISOString(), entries: [...manifest.entries.filter(item => item.id !== entry.id), { id: entry.id, taskId: entry.taskId, agent: entry.agent, createdAt: entry.createdAt, summary: entry.summary, changedPaths: safeEntry.changedPaths, ...(entry.schemaDiff ? { schemaDiff: entry.schemaDiff } : {}), validation: { status: entry.validation.status, checks: [...entry.validation.checks], ...(entry.validation.details ? { details: entry.validation.details } : {}) } }] };
  if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 2_000_000) throw new Error('Scratchpad exceeds the maximum manifest size.');
  await atomicJson(file, next);
  return next;
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

export async function readScratchpad(root) {
  const manifest = JSON.parse(await readFile(join(root, '.leo', 'scratchpad.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('Scratchpad manifest must be valid before a downstream task starts.');
  return manifest;
}

export async function createAgentWorktree(root, name, baseRef = 'HEAD') {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(name) || !/^[A-Za-z0-9._/-]{1,120}$/.test(baseRef) || baseRef.startsWith('-') || baseRef.includes('..')) throw new Error('Invalid agent name or base ref.');
  const projectRoot = resolve(root);
  const scratchpadFile = join(projectRoot, '.leo', 'scratchpad.json');
  try { await access(scratchpadFile, constants.F_OK); } catch { await atomicJson(scratchpadFile, { version: 1, updatedAt: new Date().toISOString(), entries: [] }); }
  await readScratchpad(projectRoot);
  const git = await execFile('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot });
  if (resolve(git.stdout.trim()) !== projectRoot) throw new Error('Run this from the Git repository root.');
  const worktree = join(projectRoot, '.leo', 'worktrees', `agent-${name}`);
  try { await access(worktree, constants.F_OK); throw new Error(`Worktree already exists: ${worktree}`); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await mkdir(dirname(worktree), { recursive: true });
  await execFile('git', ['worktree', 'add', '-b', `leo/agent-${name}`, worktree, baseRef], { cwd: projectRoot, timeout: 30_000 });
  return worktree;
}

export async function validateAgentWorktree(worktree, scripts = ['typecheck', 'lint', 'test', 'build']) {
  const allowed = new Set(['typecheck', 'lint', 'test', 'build']);
  if (!Array.isArray(scripts) || scripts.some(script => !allowed.has(script))) throw new Error('Only the fixed validation scripts typecheck, lint, test, and build are allowed.');
  const before = await execFile('git', ['status', '--porcelain'], { cwd: worktree });
  if (before.stdout.trim()) throw new Error('Commit the agent changes before validation so the validated revision is immutable.');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const script of scripts) await execFile(npm, ['run', script], { cwd: worktree, timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  const { stdout: revision } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: worktree });
  await atomicJson(join(dirname(worktree), 'validation', `${worktree.split(/[\\/]/).pop()}.json`), { revision: revision.trim(), scripts, validatedAt: new Date().toISOString() });
  return { status: 'passed', scripts: [...scripts] };
}

export async function mergeAgentWorktree(root, name, targetRef = 'main') {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(name) || !/^[A-Za-z0-9._/-]{1,120}$/.test(targetRef) || targetRef.startsWith('-') || targetRef.includes('..')) throw new Error('Invalid agent name or target ref.');
  const projectRoot = resolve(root);
  const worktree = join(projectRoot, '.leo', 'worktrees', `agent-${name}`);
  const branch = `leo/agent-${name}`;
  const lockPath = join(projectRoot, '.git', 'leo-merge.lock');
  const validationFile = join(projectRoot, '.leo', 'worktrees', 'validation', `agent-${name}.json`);
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new Error('Another agent merge is running or the merge lock needs manual review.'); }
  try {
    const status = await execFile('git', ['status', '--porcelain'], { cwd: projectRoot });
    if (status.stdout.trim()) throw new Error('Refusing to merge while the target checkout has uncommitted changes.');
    const { stdout: targetBranch } = await execFile('git', ['branch', '--show-current'], { cwd: projectRoot });
    if (targetBranch.trim() !== targetRef) throw new Error(`Target checkout is on ${targetBranch.trim() || 'detached HEAD'}, not ${targetRef}.`);
    const validated = JSON.parse(await readFile(validationFile, 'utf8'));
    const { stdout: revision } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: worktree });
    if (!validated.revision || revision.trim() !== validated.revision) throw new Error('Agent branch changed after validation; validate it again before merging.');
    await execFile('git', ['rebase', targetRef], { cwd: worktree, timeout: 60_000 });
    await validateAgentWorktree(worktree, validated.scripts);
    await execFile('git', ['merge', '--no-ff', '--no-edit', branch], { cwd: projectRoot, timeout: 60_000 });
    return { status: 'merged', branch, targetRef };
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}
