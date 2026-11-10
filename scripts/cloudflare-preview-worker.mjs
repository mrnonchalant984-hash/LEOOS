import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_FILES = 250;
const MAX_FILE_BYTES = 256_000;
const MAX_TOTAL_BYTES = 2_000_000;
const EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt',
  '.webmanifest', '.xml',
]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\b(?:sk|rk)_(?:live|prod)_[A-Za-z0-9_-]{16,}\b/,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?[^"' \r\n]{12,}/i,
];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required worker configuration: ${name}`);
  return value;
}

function validateProjectName(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(value);
}

function validateJob(value, expectedProject) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preview job.');
  const { id, workerId, branchName, projectName, files } = value;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid preview job ID.');
  if (typeof workerId !== 'string' || !/^gha-[0-9a-f-]{36}$/i.test(workerId)) throw new Error('Invalid preview lease.');
  if (typeof branchName !== 'string' || !/^leo-preview-[0-9a-f]{32}$/.test(branchName)) throw new Error('Invalid preview branch.');
  if (projectName !== expectedProject || !validateProjectName(projectName)) throw new Error('Preview project does not match worker configuration.');
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Invalid static file map.');

  const entries = Object.entries(files);
  if (entries.length === 0 || entries.length > MAX_FILES) throw new Error('Static file count is outside allowed limits.');
  let totalBytes = 0;
  const seenPaths = new Set();
  for (const [filePath, content] of entries) {
    if (typeof filePath !== 'string' || !filePath || filePath.length > 240
      || filePath.includes('\\') || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)
      || filePath.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')
        || part === '__proto__' || part === 'constructor' || part === 'prototype')
      || /[\u0000-\u001f]/.test(filePath)) {
      throw new Error('Static file path is invalid.');
    }
    const extension = path.posix.extname(filePath).toLowerCase();
    if (!EXTENSIONS.has(extension)) throw new Error('Static bundle contains an unsupported file type.');
    const normalized = filePath.toLowerCase();
    if (seenPaths.has(normalized)) throw new Error('Static bundle contains duplicate paths.');
    seenPaths.add(normalized);
    if (typeof content !== 'string') throw new Error('Static file contents must be text.');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new Error('A static asset exceeds the per-file size limit.');
    if (SECRET_PATTERNS.some(pattern => pattern.test(content))) throw new Error('Static asset contains a recognizable credential pattern.');
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Static assets exceed the total size limit.');
  }
  if (!Object.hasOwn(files, 'index.html')) throw new Error('A root index.html file is required.');
  return { id, workerId, branchName, projectName, files };
}

function getPreviewUrl(job) {
  return `https://${job.branchName}.${job.projectName}.pages.dev`;
}

async function requestJson(url, secret, body) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'cache-control': 'no-store',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`LeonardX worker API returned HTTP ${response.status}.`);
  return response.json();
}

async function assertPrecreatedPagesProject(accountId, projectName, token) {
  const projectUrl = new URL(
    `/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`,
    'https://api.cloudflare.com',
  );
  const response = await fetch(projectUrl, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null);
  const sourceType = result?.result?.source?.type;
  if (!response.ok || result?.success !== true || result?.result?.name !== projectName
    || (sourceType && sourceType !== 'upload' && sourceType !== 'direct_upload')) {
    throw new Error('Configured Cloudflare Pages project must already exist and use Direct Upload.');
  }
}

async function writeStaticAssets(directory, files) {
  for (const [filePath, content] of Object.entries(files)) {
    const destination = path.resolve(directory, ...filePath.split('/'));
    if (!destination.startsWith(`${directory}${path.sep}`)) throw new Error('Static file path escaped its workspace.');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' });
  }
}

async function deploy(job, directory) {
  await execFileAsync('npx', [
    '--yes',
    'wrangler@4.159.0',
    'pages',
    'deploy',
    directory,
    '--project-name',
    job.projectName,
    '--branch',
    job.branchName,
  ], {
    cwd: directory,
    env: { ...process.env, CI: 'true' },
    timeout: 300_000,
    windowsHide: true,
    maxBuffer: 1_000_000,
  });

  const url = getPreviewUrl(job);
  for (let attempt = 0; attempt < 18; attempt++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 200) return url;
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw Object.assign(new Error('Cloudflare preview did not become ready.'), { code: 'preview_not_ready' });
}

async function main() {
  const baseUrl = new URL(requiredEnv('LEONARDX_BASE_URL'));
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
    throw new Error('LEONARDX_BASE_URL must be a clean HTTPS origin.');
  }
  const secret = requiredEnv('CRON_SECRET');
  const cloudflareToken = requiredEnv('CLOUDFLARE_API_TOKEN');
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid.');
  const expectedProject = requiredEnv('CLOUDFLARE_PAGES_PROJECT');
  if (!validateProjectName(expectedProject)) throw new Error('CLOUDFLARE_PAGES_PROJECT is invalid.');

  const payload = await requestJson(new URL('/api/internal/previews/worker', baseUrl), secret);
  if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'job')) {
    throw new Error('LeonardX returned an invalid preview queue response.');
  }
  if (payload.job === null) {
    console.log('No Cloudflare preview job is queued.');
    return;
  }
  const job = validateJob(payload.job, expectedProject);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'leo-cloudflare-preview-'));
  let status = 'failed';
  let result;
  try {
    await assertPrecreatedPagesProject(accountId, expectedProject, cloudflareToken);
    await writeStaticAssets(directory, job.files);
    const url = await deploy(job, directory);
    status = 'deployed';
    result = { id: job.id, workerId: job.workerId, status, url };
  } catch (error) {
    const code = error && typeof error === 'object' && error.code === 'preview_not_ready'
      ? 'preview_not_ready'
      : error && typeof error === 'object' && (error.killed || error.signal)
        ? 'preview_worker_timeout'
        : 'preview_deploy_failed';
    result = { id: job.id, workerId: job.workerId, status, errorCode: code };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  await requestJson(new URL('/api/internal/previews/result', baseUrl), secret, result);
  console.log(`Cloudflare preview ${status} for job ${job.id}.`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Unexpected preview worker error.';
  console.error(message);
  process.exitCode = 1;
});
