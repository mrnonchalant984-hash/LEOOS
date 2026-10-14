const base = process.env.LEONARDX_STAGING_URL?.replace(/\/$/, '');
if (!base) { console.error('Set LEONARDX_STAGING_URL to a staging deployment.'); process.exit(2); }
const url = new URL(base);
if (url.protocol !== 'https:' || /(^|\.)vercel\.app$/i.test(url.hostname) && !url.hostname.includes('staging')) { console.error('Refusing to test a production-looking URL.'); process.exit(2); }
const checks = [
  { path: '/api/health', expected: 200 },
  { path: '/api/health/ready', expected: 200 },
];
let failed = false;
for (const check of checks) {
  const start = performance.now();
  try {
    const response = await fetch(`${base}${check.path}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    const ok = response.status === check.expected;
    console.log(JSON.stringify({ path: check.path, expected_status: check.expected, status: response.status, ok, duration_ms: Math.round(performance.now()-start), body: check.path.endsWith('/ready') ? body : undefined }));
    if (!ok) failed = true;
  } catch (error) { console.error(JSON.stringify({ path: check.path, ok: false, error: error instanceof Error ? error.name : 'request_failed' })); failed = true; }
}
if (failed) process.exit(1);
