import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getOpenNextVersionForNext,
  getStaticRobotsTextFromLegacySource,
  getSupportedNextVersionForPreview,
  WORKER_WRANGLER_VERSION,
} from './cloudflare-preview-versions.mjs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_FILES = 250;
const MAX_FILE_BYTES = 256_000;
const MAX_TOTAL_BYTES = 2_000_000;
const SUPPORTED_EXTENSIONS = new Set([
  '.css', '.scss', '.sass', '.html', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.md', '.mdx', '.svg', '.txt', '.xml', '.webmanifest', '.yaml', '.yml', '.toml',
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
  if (!value) throw new Error('Missing required worker configuration: ' + name);
  return value;
}

function validateProjectName(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(value);
}

function getWorkerName(prefix, projectId) {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'braverton-preview';
  return (safePrefix + '-' + projectId.replaceAll('-', '').toLowerCase().slice(0, 16)).slice(0, 63);
}

function validateJob(value, expectedPrefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preview job.');
  const { id, workerId, branchName, projectName, projectId, files } = value;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid preview job ID.');
  if (typeof workerId !== 'string' || !/^gha-[0-9a-f-]{36}$/i.test(workerId)) throw new Error('Invalid preview lease.');
  if (typeof branchName !== 'string' || !/^leo-preview-[0-9a-f]{32}$/.test(branchName)) throw new Error('Invalid preview job branch.');
  if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) throw new Error('Invalid preview project ID.');
  if (projectName !== expectedPrefix || !validateProjectName(projectName)) throw new Error('Preview project prefix does not match worker configuration.');
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Invalid preview source file map.');

  const entries = Object.entries(files);
  if (entries.length === 0 || entries.length > MAX_FILES) throw new Error('Preview file count is outside allowed limits.');
  let totalBytes = 0;
  const seenPaths = new Set();
  for (const [filePath, content] of entries) {
    if (typeof filePath !== 'string' || !filePath || filePath.length > 240
      || filePath.includes('\\') || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)
      || filePath.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')
        || part === '__proto__' || part === 'constructor' || part === 'prototype')
      || /[\u0000-\u001f]/.test(filePath)) {
      throw new Error('Preview source path is invalid.');
    }
    const extension = path.posix.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('Preview bundle contains an unsupported source file type.');
    const normalized = filePath.toLowerCase();
    if (seenPaths.has(normalized)) throw new Error('Preview bundle contains duplicate paths.');
    seenPaths.add(normalized);
    if (typeof content !== 'string') throw new Error('Preview source file contents must be text.');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new Error('A preview source file exceeds the per-file size limit.');
    if (SECRET_PATTERNS.some(pattern => pattern.test(content))) throw new Error('Preview source contains a recognizable credential pattern.');
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Preview source exceeds the total size limit.');
  }

  let framework = 'static';
  if (!Object.hasOwn(files, 'index.html')) {
    let packageJson;
    try { packageJson = JSON.parse(files['package.json'] || ''); }
    catch { throw new Error('A valid package.json or root index.html is required.'); }
    const dependencies = {
      ...(packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {}),
      ...(packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {}),
    };
    const hasNext = typeof dependencies.next === 'string' && dependencies.next.length > 0;
    const hasAppPage = ['app/page.tsx', 'app/page.jsx', 'app/page.js', 'src/app/page.tsx', 'src/app/page.jsx', 'src/app/page.js'].some(file => Object.hasOwn(files, file));
    const hasAppLayout = ['app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js'].some(file => Object.hasOwn(files, file));
    const hasPagesIndex = ['pages/index.tsx', 'pages/index.jsx', 'pages/index.js', 'src/pages/index.tsx', 'src/pages/index.jsx', 'src/pages/index.js'].some(file => Object.hasOwn(files, file));
    if (!hasNext || !((hasAppPage && hasAppLayout) || hasPagesIndex)) {
      throw new Error('A root index.html or supported Next.js application entry is required.');
    }
    framework = 'nextjs';
  }

  return { id, workerId, branchName, projectId, projectName, workerName: getWorkerName(projectName, projectId), framework, files };
}

async function requestJson(url, secret, body) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: 'Bearer ' + secret,
      'cache-control': 'no-store',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('Braverton preview API returned HTTP ' + response.status + '.');
  return response.json();
}

async function getWorkersSubdomain(accountId, token) {
  const url = new URL('/client/v4/accounts/' + accountId + '/workers/subdomain', 'https://api.cloudflare.com');
  const response = await fetch(url, {
    headers: { authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null);
  const subdomain = result?.result?.subdomain;
  if (!response.ok || result?.success !== true || typeof subdomain !== 'string' || !/^[a-z0-9-]{1,63}$/.test(subdomain)) {
    throw Object.assign(new Error('Cloudflare Workers subdomain could not be verified.'), { code: 'preview_worker_configuration_failed' });
  }
  return subdomain;
}

function buildEnvironment() {
  // Never pass the GitHub runner's ambient environment to generated project
  // scripts. Build code is untrusted and receives only the minimum process
  // environment needed to install and compile a Next.js preview.
  const env = {};
  for (const name of [
    'PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL',
    'SYSTEMROOT', 'WINDIR', 'PATHEXT',
  ]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  env.CI = 'true';
  env.NODE_ENV = 'production';
  env.NEXT_TELEMETRY_DISABLED = '1';
  return env;
}

function deployEnvironment(token, accountId) {
  const env = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    CI: 'true',
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };
  for (const name of ['TMPDIR', 'TEMP', 'TMP', 'LANG', 'SYSTEMROOT']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

async function writeProjectFiles(directory, files) {
  for (const [filePath, content] of Object.entries(files)) {
    const destination = path.resolve(directory, ...filePath.split('/'));
    if (!destination.startsWith(directory + path.sep)) throw new Error('Preview source path escaped its workspace.');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' });
  }
}

async function writeWranglerConfig(directory, workerName, framework) {
  const config = {
    '$schema': './node_modules/wrangler/config-schema.json',
    name: workerName,
    main: framework === 'nextjs' ? '.open-next/worker.js' : 'worker.mjs',
    compatibility_date: '2026-11-22',
    compatibility_flags: ['nodejs_compat'],
    assets: {
      directory: framework === 'nextjs' ? '.open-next/assets' : 'preview-assets',
      binding: 'ASSETS',
    },
    workers_dev: true,
    observability: { enabled: true },
  };
  await writeFile(path.join(directory, 'wrangler.jsonc'), JSON.stringify(config, null, 2), 'utf8');
}

async function normalizeLegacyRobotsTextRoute(directory) {
  for (const relativePath of ['app/robots.ts', 'src/app/robots.ts']) {
    const routePath = path.join(directory, relativePath);
    let source;
    try {
      source = await readFile(routePath, 'utf8');
    } catch {
      continue;
    }

    const robotsText = getStaticRobotsTextFromLegacySource(source);
    if (robotsText === null) continue;

    const publicDirectory = path.join(directory, 'public');
    const publicRobotsPath = path.join(publicDirectory, 'robots.txt');
    try {
      await readFile(publicRobotsPath);
      console.log(
        'Preview compatibility: removed a legacy string-returning ' + relativePath +
        ' because public/robots.txt already defines the robots response.'
      );
    } catch {
      await mkdir(publicDirectory, { recursive: true });
      await writeFile(publicRobotsPath, robotsText, 'utf8');
      console.log(
        'Preview compatibility: converted legacy string-returning ' + relativePath +
        ' into public/robots.txt for the isolated build copy.'
      );
    }
    await rm(routePath, { force: true });
  }
}

async function buildNextProject(directory, workerName, usesTypeScript) {
  const packagePath = path.join(directory, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  packageJson.scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
  if (!packageJson.scripts.build) packageJson.scripts.build = 'next build';
  if (usesTypeScript) {
    const currentDevDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object'
      ? packageJson.devDependencies
      : {};
    packageJson.devDependencies = {
      ...currentDevDependencies,
      typescript: currentDevDependencies.typescript || '^5.9.3',
      '@types/node': currentDevDependencies['@types/node'] || '^22.0.0',
      '@types/react': currentDevDependencies['@types/react'] || '^19.2.0',
      '@types/react-dom': currentDevDependencies['@types/react-dom'] || '^19.2.0',
    };
  }
  const nextDependencySection = packageJson.dependencies?.next
    ? 'dependencies'
    : packageJson.devDependencies?.next
      ? 'devDependencies'
      : null;
  if (!nextDependencySection) throw new Error('A Next.js dependency must be declared in package.json.');
  const declaredNext = packageJson[nextDependencySection].next;
  const normalizedDeclaredNext = String(declaredNext).replace(/^[~^<>=\s]*/, '');
  const targetNext = getSupportedNextVersionForPreview(normalizedDeclaredNext);
  if (targetNext !== normalizedDeclaredNext) {
    packageJson[nextDependencySection].next = targetNext;
    console.log(
      'Preview build copy: upgrading Next.js ' + normalizedDeclaredNext + ' to ' + targetNext +
      ' because current OpenNext releases no longer support the older Next.js line. ' +
      'The submitted workspace files are not modified.'
    );
  }
  await writeFile(packagePath, JSON.stringify(packageJson, null, 2), 'utf8');
  await normalizeLegacyRobotsTextRoute(directory);

  const nextConfigPaths = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'];
  let hasNextConfig = false;
  for (const configName of nextConfigPaths) {
    try {
      await (await import('node:fs/promises')).access(path.join(directory, configName));
      hasNextConfig = true;
      break;
    } catch {
      // Try the next supported Next.js config extension.
    }
  }
  if (!hasNextConfig) {
    const newline = String.fromCharCode(10);
    const configName = packageJson.type === 'module' ? 'next.config.mjs' : 'next.config.js';
    const defaultConfig = packageJson.type === 'module' ? 'export default {};' + newline : 'module.exports = {};' + newline;
    await writeFile(path.join(directory, configName), defaultConfig, 'utf8');
  }

  const openNextConfig = path.join(directory, 'open-next.config.ts');
  try {
    await (await import('node:fs/promises')).access(openNextConfig);
  } catch {
    await writeFile(openNextConfig,
      'import { defineCloudflareConfig } from "@opennextjs/cloudflare";\nexport default defineCloudflareConfig();\n',
      'utf8');
  }

  const env = buildEnvironment();
  const installEnv = { ...env, NODE_ENV: 'development', npm_config_production: 'false' };
  try {
    await execFileAsync('npm', ['install', '--include=dev', '--no-audit', '--no-fund'], {
      cwd: directory, env: installEnv, timeout: 600_000, windowsHide: true, maxBuffer: 4_000_000,
    });
    const installedNext = JSON.parse(await readFile(path.join(directory, 'node_modules', 'next', 'package.json'), 'utf8')).version;
    const openNextVersion = getOpenNextVersionForNext(installedNext);
    console.log('Using Next.js ' + installedNext + ', OpenNext ' + openNextVersion + ', Wrangler ' + WORKER_WRANGLER_VERSION + '.');
    await execFileAsync('npm', ['install', '--include=dev', '--no-save', '--no-audit', '--no-fund', '@opennextjs/cloudflare@' + openNextVersion, 'wrangler@' + WORKER_WRANGLER_VERSION], {
      cwd: directory, env: installEnv, timeout: 600_000, windowsHide: true, maxBuffer: 4_000_000,
    });
    await writeWranglerConfig(directory, workerName, 'nextjs');
    await execFileAsync('npx', ['opennextjs-cloudflare', 'build'], {
      cwd: directory, env, timeout: 600_000, windowsHide: true, maxBuffer: 4_000_000,
    });
  } catch (error) {
    const detail = error && typeof error === 'object' && typeof error.stderr === 'string' ? error.stderr.slice(-4000) : '';
    if (detail) console.error('Next.js preview build diagnostics (no credentials were passed to this process):\n' + detail);
    throw Object.assign(new Error('Next.js preview build failed. Review the Cloudflare preview worker build log.'), { code: 'preview_build_failed' });
  }
}

async function deployWorker(directory, token, accountId) {
  const deployment = await execFileAsync('npx', ['--yes', 'wrangler@' + WORKER_WRANGLER_VERSION, 'deploy', '--config', 'wrangler.jsonc'], {
    cwd: directory,
    env: deployEnvironment(token, accountId),
    timeout: 300_000,
    windowsHide: true,
    maxBuffer: 2_000_000,
  });
  if (deployment.stdout) console.log('Wrangler deployment output (no credentials):\\n' + deployment.stdout.slice(-4000));
  if (deployment.stderr) console.log('Wrangler deployment diagnostics (no credentials):\\n' + deployment.stderr.slice(-2000));
}

async function captureWorkerRuntimeLogs(directory, workerName, token, accountId, url) {
  let diagnosticStatus = null;
  const tailPromise = execFileAsync('npx', ['--yes', 'wrangler@' + WORKER_WRANGLER_VERSION, 'tail', workerName, '--format', 'json'], {
    cwd: directory,
    env: deployEnvironment(token, accountId),
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 2_000_000,
  }).then(result => result.stdout + result.stderr).catch(error =>
    String(error.stdout || '') + String(error.stderr || '') + '\\nTail command ended: ' + (error instanceof Error ? error.message : 'unknown error')
  );
  await new Promise(resolve => setTimeout(resolve, 1_500));
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    diagnosticStatus = response.status;
    console.log('Worker runtime diagnostic request returned HTTP ' + response.status + '.');
    await response.body?.cancel();
  } catch (error) {
    console.log('Worker runtime diagnostic request failed: ' + (error instanceof Error ? error.message.slice(0, 240) : 'network error'));
  }
  const rawOutput = (await tailPromise).slice(-12_000);
  const eventStart = rawOutput.indexOf('\"event\": {');
  const output = (eventStart >= 0 ? rawOutput.slice(0, eventStart) + '\"event\": \"[redacted]\"\\n' : rawOutput).slice(-6_000);
  if (output) console.log('Cloudflare Worker runtime logs (diagnostic excerpt; request metadata redacted):\\n' + output);
  return diagnosticStatus;
}

async function waitForWorker(url, directory, workerName, token, accountId) {
  let lastStatus = 'no response';
  let diagnosticsCaptured = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = 'HTTP ' + response.status;
      if (response.status >= 200 && response.status < 400) {
        console.log('Cloudflare Worker preview health check passed (' + lastStatus + ').');
        return url;
      }
      console.log('Cloudflare Worker preview health check ' + (attempt + 1) + '/24 returned ' + lastStatus + '.');
      if (response.status >= 500 && !diagnosticsCaptured) {
        await response.body?.cancel();
        diagnosticsCaptured = true;
        const diagnosticStatus = await captureWorkerRuntimeLogs(directory, workerName, token, accountId, url);
        if (diagnosticStatus !== null && diagnosticStatus >= 200 && diagnosticStatus < 400) {
          console.log('Cloudflare Worker became healthy after warm-up (HTTP ' + diagnosticStatus + ').');
          return url;
        }
        lastStatus += '; diagnostic request ' + (diagnosticStatus === null ? 'had no response' : 'returned HTTP ' + diagnosticStatus);
      }
      await response.body?.cancel();
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'preview_not_ready') throw error;
      lastStatus = error instanceof Error ? error.message.slice(0, 240) : 'network error';
      console.log('Cloudflare Worker preview health check ' + (attempt + 1) + '/24 failed: ' + lastStatus);
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw Object.assign(new Error('Cloudflare Worker preview did not become ready; last result: ' + lastStatus), { code: 'preview_not_ready' });
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
  const expectedPrefix = requiredEnv('CLOUDFLARE_WORKER_PREFIX');
  if (!validateProjectName(expectedPrefix)) throw new Error('CLOUDFLARE_WORKER_PREFIX must be a valid Worker name prefix.');

  const payload = await requestJson(new URL('/api/internal/previews/worker', baseUrl), secret);
  if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'job')) {
    throw new Error('Braverton returned an invalid preview queue response.');
  }
  if (payload.job === null) {
    console.log('No Cloudflare Worker preview job is queued.');
    return;
  }

  const job = validateJob(payload.job, expectedPrefix);
  const heartbeatUrl = new URL('/api/internal/previews/worker', baseUrl);
  const heartbeatTimer = setInterval(() => {
    requestJson(heartbeatUrl, secret, { id: job.id, workerId: job.workerId }).catch(error => {
      console.error('Cloudflare preview worker heartbeat failed: ' + (error instanceof Error ? error.message.slice(0, 240) : 'unknown error'));
    });
  }, 60_000);
  heartbeatTimer.unref?.();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'braverton-cloudflare-worker-preview-'));
  let status = 'failed';
  let result;
  try {
    const subdomain = await getWorkersSubdomain(accountId, cloudflareToken);
    if (job.framework === 'nextjs') {
      await writeProjectFiles(directory, job.files);
      const usesTypeScript = Object.keys(job.files).some(filePath => filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath === 'tsconfig.json');
      await buildNextProject(directory, job.workerName, usesTypeScript);
    } else {
      const assetsDirectory = path.join(directory, 'preview-assets');
      await writeProjectFiles(assetsDirectory, job.files);
      await writeFile(path.join(directory, 'worker.mjs'),
        'export default { async fetch(request, env) { const response = await env.ASSETS.fetch(request); if (response.status !== 404) return response; const url = new URL(request.url); url.pathname = "/index.html"; return env.ASSETS.fetch(new Request(url.toString(), request)); } };\n',
        'utf8');
      await writeWranglerConfig(directory, job.workerName, 'static');
    }
    await deployWorker(directory, cloudflareToken, accountId);
    const url = 'https://' + job.workerName + '.' + subdomain + '.workers.dev';
    console.log('Checking deployed Worker preview URL: ' + url);
    const verifiedUrl = await waitForWorker(url, directory, job.workerName, cloudflareToken, accountId);
    status = 'deployed';
    result = { id: job.id, workerId: job.workerId, status, url: verifiedUrl };
  } catch (error) {
    const allowedCodes = new Set(['preview_build_failed', 'preview_not_ready', 'preview_worker_configuration_failed']);
    const code = error && typeof error === 'object' && typeof error.code === 'string' && allowedCodes.has(error.code)
      ? error.code
      : error && typeof error === 'object' && (error.killed || error.signal)
        ? 'preview_worker_timeout'
        : 'preview_deploy_failed';
    console.error('Cloudflare Worker preview failed with code: ' + code);
    const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : 'Unexpected preview deployment failure.';
    console.error('Cloudflare Worker preview diagnostic: ' + errorMessage);
    result = { id: job.id, workerId: job.workerId, status, errorCode: code, errorMessage };
  } finally {
    clearInterval(heartbeatTimer);
    await rm(directory, { recursive: true, force: true });
  }

  await requestJson(new URL('/api/internal/previews/result', baseUrl), secret, result);
  console.log('Cloudflare Worker preview ' + status + ' for job ' + job.id + '.');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Unexpected Cloudflare Worker preview error.';
  console.error(message);
  process.exitCode = 1;
});
