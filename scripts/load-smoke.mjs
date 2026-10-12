const baseUrl = process.env.LEONARDX_STAGING_URL?.replace(/\/$/, '');
const allow = process.env.LEONARDX_ALLOW_STAGING_LOAD === 'true';
const durationSeconds = Math.min(Math.max(Number(process.env.LEONARDX_LOAD_SECONDS || 30), 5), 120);
const concurrency = Math.min(Math.max(Number(process.env.LEONARDX_LOAD_CONCURRENCY || 2), 1), 10);

if (!baseUrl || !allow) {
  console.error('Refusing to run. Set LEONARDX_STAGING_URL and LEONARDX_ALLOW_STAGING_LOAD=true.');
  process.exit(2);
}
const target = new URL(baseUrl);
if (!['http:', 'https:'].includes(target.protocol) || /vercel\.app$/i.test(target.hostname) && !target.hostname.includes('staging')) {
  console.error('Refusing to run against an unapproved-looking production URL. Use an explicit staging hostname.');
  process.exit(2);
}

const end = Date.now() + durationSeconds * 1000;
const results = [];
async function worker() {
  while (Date.now() < end) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      results.push({ ok: response.ok, status: response.status, ms: Math.round(performance.now() - started) });
    } catch (error) {
      results.push({ ok: false, status: 0, ms: Math.round(performance.now() - started), error: error instanceof Error ? error.name : 'error' });
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const successful = results.filter(item => item.ok).length;
const sorted = results.map(item => item.ms).sort((a, b) => a - b);
const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
console.log(JSON.stringify({ baseUrl, durationSeconds, concurrency, requests: results.length, successful, failed: results.length - successful, p50_ms: percentile(0.5), p95_ms: percentile(0.95), p99_ms: percentile(0.99) }, null, 2));
