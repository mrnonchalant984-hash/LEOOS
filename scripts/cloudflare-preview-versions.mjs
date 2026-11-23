export const WORKER_WRANGLER_VERSION = '4.164.0';
export const OPENNEXT_CLOUDFLARE_VERSION = '1.20.18';
export const MINIMUM_SUPPORTED_NEXT = Object.freeze({
  15: '15.5.29',
  16: '16.4.5',
});

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value));
  if (!match) throw new Error('Could not determine the installed Next.js version for preview compatibility.');
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function getSupportedNextVersionForPreview(nextVersion) {
  const [major] = parseVersion(nextVersion);
  if (major <= 14) return MINIMUM_SUPPORTED_NEXT[15];
  if (major === 15) {
    return compareVersions(nextVersion, MINIMUM_SUPPORTED_NEXT[15]) < 0
      ? MINIMUM_SUPPORTED_NEXT[15]
      : String(nextVersion);
  }
  if (major === 16) {
    return compareVersions(nextVersion, MINIMUM_SUPPORTED_NEXT[16]) < 0
      ? MINIMUM_SUPPORTED_NEXT[16]
      : String(nextVersion);
  }
  throw new Error('No supported Cloudflare preview runtime exists for Next.js ' + nextVersion + '.');
}

export function getOpenNextVersionForNext(nextVersion) {
  const [major] = parseVersion(nextVersion);
  if (major === 15 && compareVersions(nextVersion, MINIMUM_SUPPORTED_NEXT[15]) >= 0) {
    return OPENNEXT_CLOUDFLARE_VERSION;
  }
  if (major === 16 && compareVersions(nextVersion, MINIMUM_SUPPORTED_NEXT[16]) >= 0) {
    return OPENNEXT_CLOUDFLARE_VERSION;
  }
  throw new Error(
    'Next.js ' + nextVersion + ' is below the supported OpenNext security floor. ' +
    'Upgrade the preview build to Next.js ' + MINIMUM_SUPPORTED_NEXT[15] +
    ' or ' + MINIMUM_SUPPORTED_NEXT[16] + ' before building.'
  );
}
