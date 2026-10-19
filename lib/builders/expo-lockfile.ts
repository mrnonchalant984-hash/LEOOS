import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MAX_LOCKFILE_BYTES = 2 * 1024 * 1024;

function recognizedLockfile(files: Record<string, string>) {
  return ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].some(file => Boolean(files[file]?.trim()));
}

function validateLockfile(text: string, packageName: string) {
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_LOCKFILE_BYTES) throw new Error('The generated npm lockfile is empty or exceeds the 2 MB limit.');
  let lock: Record<string, unknown>;
  try { lock = JSON.parse(text); }
  catch { throw new Error('npm did not generate a valid package-lock.json.'); }
  const packages = lock.packages && typeof lock.packages === 'object' ? lock.packages as Record<string, unknown> : {};
  const root = packages[''] && typeof packages[''] === 'object' ? packages[''] as Record<string, unknown> : {};
  if (lock.lockfileVersion !== 3 || root.name !== packageName) throw new Error("The generated npm lockfile does not match this Expo project's package manifest.");
  return text;
}

async function generateNpmLockfile(packageJson: Record<string, unknown>) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'leonardx-expo-lock-'));
  try {
    await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? process.env.NODE_ENV : 'production',
      ...Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'COMSPEC']
      .filter(name => process.env[name])
      .map(name => [name, process.env[name]!])),
    };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--lockfile-version=3'],
        { cwd: temporary, env, stdio: ['ignore', 'ignore', 'ignore'], shell: process.platform === 'win32', windowsHide: true });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('npm dependency resolution timed out. Check registry access, then retry the build.'));
      }, 120_000);
      child.once('error', error => { clearTimeout(timer); reject(new Error(`npm dependency resolution could not start: ${error.message}`)); });
      child.once('close', code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`npm dependency resolution failed with exit code ${code ?? 'unknown'}. Check dependency versions and registry access.`));
      });
    });
    return await readFile(path.join(temporary, 'package-lock.json'), 'utf8');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function ensureExpoLockfile(
  files: Record<string, string>,
  generateLockfile = generateNpmLockfile,
) {
  let preparedFiles = files;
  let generated = false;
  if (!recognizedLockfile(preparedFiles)) {
    let packageJson: Record<string, unknown>;
    try { packageJson = JSON.parse(preparedFiles['package.json'] || ''); }
    catch { throw new Error('A valid package.json is required before resolving Expo dependencies.'); }
    const packageManager = typeof packageJson.packageManager === 'string' ? packageJson.packageManager : '';
    if (packageManager && !packageManager.startsWith('npm@')) {
      throw new Error('This project declares a non-npm package manager but has no lockfile. Add its matching lockfile before building.');
    }
    if (typeof packageJson.name !== 'string' || !packageJson.name.trim()) throw new Error('package.json must include a project name before dependency resolution.');
    const lockfile = validateLockfile(await generateLockfile(packageJson), packageJson.name);
    preparedFiles = { ...preparedFiles, 'package-lock.json': lockfile };
    generated = true;
  }

  let packageJson: Record<string, unknown>;
  try { packageJson = JSON.parse(preparedFiles['package.json'] || ''); }
  catch { throw new Error('A valid package.json is required before validating an Expo build.'); }
  const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts as Record<string, unknown> : {};
  const checks = ['lint', 'test', 'typecheck'].filter(name => typeof scripts[name] === 'string' && (scripts[name] as string).trim());
  if (checks.length) {
    const existingHook = typeof scripts['eas-build-post-install'] === 'string' ? (scripts['eas-build-post-install'] as string).trim() : '';
    scripts['eas-build-post-install'] = [existingHook, ...checks.map(name => `npm run ${name}`)].filter(Boolean).join(' && ');
    packageJson.scripts = scripts;
    preparedFiles = { ...preparedFiles, 'package.json': `${JSON.stringify(packageJson, null, 2)}\n` };
  }
  return { files: preparedFiles, generated };
}