import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { ExpoPlatform, EasProfile } from './expo-eas.ts';

export const MAX_EXPO_ARTIFACT_BYTES = 150 * 1024 * 1024;

export type ExpoArtifactType = 'apk' | 'aab' | 'ipa';

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    if (isIP(hostname) === 4) {
      const [first, second] = hostname.split('.').map(Number);
      if (first === 0 || first === 10 || first === 127 || first >= 224 ||
        (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)) return false;
    }
    if (isIP(hostname) === 6 && (hostname === '::' || hostname === '::1' || hostname.startsWith('::ffff:') ||
      hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:') || hostname.startsWith('ff'))) return false;
    return true;
  } catch {
    return false;
  }
}

export function expectedExpoArtifactType(platform: ExpoPlatform, profile: EasProfile, files: Record<string, string>): ExpoArtifactType {
  if (platform === 'ios') return 'ipa';
  try {
    const eas = JSON.parse(files['eas.json']) as Record<string, unknown>;
    const build = eas.build && typeof eas.build === 'object' ? eas.build as Record<string, unknown> : {};
    const selected = build[profile] && typeof build[profile] === 'object' ? build[profile] as Record<string, unknown> : {};
    const android = selected.android && typeof selected.android === 'object' ? selected.android as Record<string, unknown> : {};
    if (android.buildType === 'apk') return 'apk';
    if (android.buildType === 'app-bundle') return 'aab';
  } catch { /* Validation reports malformed EAS configuration before this helper is used. */ }
  return profile === 'production' ? 'aab' : 'apk';
}

export function verifyExpoArtifact(bytes: Uint8Array, artifactType: ExpoArtifactType) {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_EXPO_ARTIFACT_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  return JSZip.loadAsync(bytes).then(zip => {
    const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    const valid = artifactType === 'apk'
      ? files.includes('AndroidManifest.xml') && files.some(name => /^classes(?:\d+)?\.dex$/.test(name))
      : artifactType === 'aab'
        ? files.includes('BundleConfig.pb') && files.includes('base/manifest/AndroidManifest.xml')
        : files.some(name => /^Payload\/[^/]+\.app\/Info\.plist$/.test(name));
    if (!valid) return null;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const contentType = artifactType === 'apk' ? 'application/vnd.android.package-archive' : 'application/octet-stream';
    return { sizeBytes: bytes.byteLength, sha256, contentType, extension: artifactType };
  }).catch(() => null);
}

export async function downloadExpoArtifact(url: string, fetcher: typeof fetch = fetch) {
  if (!isSafeHttpsUrl(url)) throw new Error('Expo returned an unsafe artifact URL.');
  let current = url;
  let response: Response | null = null;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    response = await fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(60_000), cache: 'no-store' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirect === 5) throw new Error('Expo artifact redirect could not be safely followed.');
    current = new URL(location, current).toString();
    if (!isSafeHttpsUrl(current)) throw new Error('Expo artifact redirected to an unsafe URL.');
  }
  if (!response?.ok || !response.body) throw new Error('Expo artifact download failed.');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_EXPO_ARTIFACT_BYTES) throw new Error('Expo artifact exceeds the configured download size limit.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_EXPO_ARTIFACT_BYTES) {
      await reader.cancel();
      throw new Error('Expo artifact exceeds the configured download size limit.');
    }
    chunks.push(value);
  }
  if (declaredSize > 0 && size !== declaredSize) throw new Error('Expo artifact download size did not match its response metadata.');
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size);
}

export async function downloadExpoBuildLogs(url: string, fetcher: typeof fetch = fetch) {
  const maxBytes = 1_000_000;
  if (!isSafeHttpsUrl(url)) throw new Error('Expo returned an unsafe build logs URL.');
  let current = url;
  let response: Response | null = null;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    response = await fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(30_000), cache: 'no-store' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirect === 5) throw new Error('Expo build logs redirect could not be safely followed.');
    current = new URL(location, current).toString();
    if (!isSafeHttpsUrl(current)) throw new Error('Expo build logs redirected to an unsafe URL.');
  }
  if (!response?.ok || !response.body) throw new Error('Expo build logs could not be retrieved.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Expo build logs exceed the 1 MB response limit.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size).toString('utf8')
    .replace(/(expo[_-]?token|authorization|access[_-]?token|api[_-]?key|secret|password)(\s*[:= ]\s*)[^\s"']+/ig, '$1$2[REDACTED]');
}