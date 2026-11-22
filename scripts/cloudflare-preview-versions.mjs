export const WORKER_WRANGLER_VERSION = '4.164.0';

export function getOpenNextVersionForNext(nextVersion) {
  const match = String(nextVersion).match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
  if (!match) throw new Error('Could not determine the installed Next.js version for preview compatibility.');
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (major === 16 && minor >= 4) return minor === 4 && patch < 5 ? '1.20.12' : '1.20.17';
  if (major === 16 && minor === 3) return '1.20.10';
  if (major <= 15) return '1.19.11';
  throw new Error('No verified OpenNext adapter mapping exists for Next.js ' + nextVersion + '.');
}
