export const MAX_STUDIO_IMAGE_BYTES = 4 * 1024 * 1024;

export type SupportedImage = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
};

export function inspectImageUpload(bytes: Uint8Array, declaredType: string): SupportedImage | null {
  if (!bytes.length || bytes.length > MAX_STUDIO_IMAGE_BYTES) return null;

  let detected: SupportedImage | null = null;
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    detected = { mimeType: 'image/png', extension: 'png' };
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detected = { mimeType: 'image/jpeg', extension: 'jpg' };
  } else if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    detected = { mimeType: 'image/webp', extension: 'webp' };
  }

  return detected?.mimeType === declaredType ? detected : null;
}
