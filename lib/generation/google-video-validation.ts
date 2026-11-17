const GOOGLE_OPERATION_PATTERNS = [
  /^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/publishers\/google\/models\/[a-zA-Z0-9._-]+\/operations\/[a-zA-Z0-9_-]+$/,
  /^operations\/[a-zA-Z0-9_-]+$/,
];

export function isValidGoogleVideoOperationName(value: string): boolean {
  return value.length <= 512 && GOOGLE_OPERATION_PATTERNS.some(pattern => pattern.test(value));
}

function parseGcsUri(value: string, allowBucketRoot = false) {
  const match = /^gs:\/\/([a-z0-9][a-z0-9._-]{1,220}[a-z0-9])(?:\/(.+))?$/i.exec(value);
  const object = match?.[2] || '';
  if (!match || (!allowBucketRoot && !object) || /[?#\\\r\n]/.test(object) || object.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Google returned an unsupported video output URI.');
  }
  return { bucket: match[1], object };
}

export function validateGoogleVideoOutputUri(uri: string, configuredOutputUri: string) {
  const actual = parseGcsUri(uri);
  const configured = parseGcsUri(configuredOutputUri.replace(/\/+$/, ''), true);
  const prefix = configured.object;
  if (actual.bucket !== configured.bucket || (prefix && actual.object !== prefix && !actual.object.startsWith(`${prefix}/`))) {
    throw new Error('Google video output is outside the configured storage location.');
  }
  return actual;
}

export function validateGoogleVideoBytes(bytes: Uint8Array, mimeType?: string) {
  if (bytes.byteLength < 12 || bytes.byteLength > 500 * 1024 * 1024) {
    throw new Error('Google returned an invalid video file size.');
  }
  const normalizedMime = mimeType?.split(';', 1)[0].trim().toLowerCase();
  if (normalizedMime && normalizedMime !== 'video/mp4' && normalizedMime !== 'application/octet-stream') {
    throw new Error('Google returned an unsupported video media type.');
  }
  const signature = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (signature !== 'ftyp') throw new Error('Google returned a video file that is not a valid MP4 container.');
  return bytes;
}
