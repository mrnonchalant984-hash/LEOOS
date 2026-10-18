import 'server-only';

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeIdePath, validateIdeFiles } from '@/lib/ide-files';

export type ExpoPlatform = 'android' | 'ios';
export type EasProfile = 'preview' | 'production';

export function validateExpoProject(files: unknown, platform: ExpoPlatform, profile: EasProfile) {
  if (!validateIdeFiles(files)) return { ok: false as const, error: 'Project files have unsafe paths or exceed the workspace size limit.' };
  if (Object.keys(files).some((file) => /^\.env(?:\.|$)/i.test(file) || /\.(?:pem|key)$/i.test(file) || /^app\.config\.(?:[cm]?js|ts)$/i.test(file))) {
    return { ok: false as const, error: 'Remove environment files and private signing keys from the project before building.' };
  }
  if (!files['package.json'] || !files['app.json'] || !files['eas.json']) {
    return { ok: false as const, error: 'Expo builds require package.json, static app.json, and eas.json.' };
  }
  let packageJson: Record<string, unknown>;
  let app: Record<string, unknown>;
  let eas: Record<string, unknown>;
  try {
    packageJson = JSON.parse(files['package.json']);
    app = JSON.parse(files['app.json']);
    eas = JSON.parse(files['eas.json']);
  } catch {
    return { ok: false as const, error: 'package.json, app.json, and eas.json must contain valid JSON.' };
  }
  if (!packageJson.name || !packageJson.dependencies || typeof packageJson.dependencies !== 'object') {
    return { ok: false as const, error: 'package.json must include an app name and dependencies.' };
  }
  const expo = app.expo && typeof app.expo === 'object' ? app.expo as Record<string, unknown> : app;
  const extra = expo.extra && typeof expo.extra === 'object' ? expo.extra as Record<string, unknown> : {};
  const easLink = extra.eas && typeof extra.eas === 'object' ? extra.eas as Record<string, unknown> : {};
  if (typeof easLink.projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(easLink.projectId)) {
    return { ok: false as const, error: 'This Expo project is not linked. Set expo.extra.eas.projectId to the existing Expo project UUID.' };
  }
  if (!expo.name || !expo.slug) return { ok: false as const, error: 'app.json must include Expo name and slug.' };
  const profiles = eas.build && typeof eas.build === 'object' ? eas.build as Record<string, unknown> : {};
  const selected = profiles[profile];
  if (!selected || typeof selected !== 'object') return { ok: false as const, error: `eas.json must define the ${profile} build profile.` };
  if (platform === 'android' && profile === 'preview') {
    const selectedProfile = selected as Record<string, unknown>;
    const android = selectedProfile.android && typeof selectedProfile.android === 'object' ? selectedProfile.android as Record<string, unknown> : {};
    if (android.buildType !== 'apk') return { ok: false as const, error: 'The Android preview profile must set android.buildType to apk.' };
  }
  return { ok: true as const, projectId: easLink.projectId };
}

function safeOutput(text: string) {
  return text.slice(-1_000_000)
    .replace(/(?:expo[_-]?token|authorization|access[_-]?token)(\s*[:= ]\s*)[^\s"']+/ig, '$1[REDACTED]');
}

export async function runEasCommand(files: Record<string, string>, args: string[], timeoutMs = 90_000) {
  const token = process.env.EXPO_TOKEN?.trim();
  if (!token) throw new Error('EXPO_TOKEN is not configured on the server.');
  const cli = path.join(process.cwd(), 'node_modules', 'eas-cli', 'bin', 'run');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'leonardx-eas-'));
  try {
    for (const [file, content] of Object.entries(files)) {
      const normalized = normalizeIdePath(file);
      if (!normalized || normalized !== file) throw new Error('Unsafe project file path.');
      const target = path.join(temporary, ...normalized.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    }
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], {
        cwd: temporary,
        env: { ...process.env, EXPO_TOKEN: token, CI: '1', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const stop = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('EAS CLI request timed out before the cloud build was confirmed.'));
      }, timeoutMs);
      const append = (current: string, value: Buffer) => (current + value.toString('utf8')).slice(-1_000_000);
      child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.on('error', (error) => { if (!settled) { settled = true; clearTimeout(stop); reject(error); } });
      child.on('close', (code) => {
        if (!settled) { settled = true; clearTimeout(stop); resolve({ code, stdout: safeOutput(stdout), stderr: safeOutput(stderr) }); }
      });
    });
    return result;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function parseEasJson(stdout: string): unknown {
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* EAS may print non-JSON progress before JSON output. */ }
  }
  try { return JSON.parse(stdout); } catch { return null; }
}

export function expoMetadataFiles(files: Record<string, string>) {
  return Object.fromEntries(['package.json', 'app.json', 'eas.json'].filter(file => typeof files[file] === 'string').map(file => [file, files[file]]));
}
