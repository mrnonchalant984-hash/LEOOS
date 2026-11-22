export const WORKER_WRANGLER_VERSION = '4.164.0';

export function getOpenNextVersionForNext(nextVersion) {
  const parts = String(nextVersion).split(/[.-]/);
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (![major, minor, patch].every(Number.isFinite)) {
    throw new Error('Could not determine the installed Next.js version for preview compatibility.');
  }

  if (major === 16 && minor >= 4) return minor === 4 && patch < 5 ? '1.20.12' : '1.20.17';
  if (major === 16 && minor === 3) return '1.20.10';
  if (major <= 15) return '1.19.11';
  throw new Error('No verified OpenNext adapter mapping exists for Next.js ' + nextVersion + '.');
}
