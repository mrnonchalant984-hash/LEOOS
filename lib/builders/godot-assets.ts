import { createHash } from 'node:crypto';
import { normalizeIdePath } from '../ide-files.ts';

export const GODOT_PROJECT_ASSET_MAX_BYTES = 2_000_000;
export const GODOT_PROJECT_ASSET_MAX_COUNT = 20;
export const GODOT_PROJECT_ASSET_TOTAL_BYTES = 2_000_000;
export const GODOT_ASSET_MANIFEST_PATH = 'assets/.asset-manifest.json';

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function validateGodotAssetPath(value: unknown) {
  const path = normalizeIdePath(value);
  if (!path || path !== value || !path.startsWith('assets/')) return null;
  const parts = path.split('/');
  if (parts.length < 2 || parts.slice(1).some(part => !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,79}$/.test(part) || part === '.' || part === '..')) return null;
  const extension = parts.at(-1)?.match(/\.[^.]+$/)?.[0].toLowerCase() || '';
  const mimeType = mimeByExtension[extension];
  if (!mimeType) return null;
  return { path, extension, mimeType };
}

export function validateGodotImageBytes(path: unknown, mimeType: unknown, bytes: Uint8Array) {
  const asset = validateGodotAssetPath(path);
  if (!asset || asset.mimeType !== mimeType || !bytes.length || bytes.length > GODOT_PROJECT_ASSET_MAX_BYTES) return null;
  const header = Buffer.from(bytes.subarray(0, 12));
  const valid = mimeType === 'image/png'
    ? header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mimeType === 'image/jpeg'
      ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
      : mimeType === 'image/webp'
        ? header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
        : false;
  if (!valid) return null;
  return { ...asset, sizeBytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}
