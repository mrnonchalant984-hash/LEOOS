const baseUrl = process.env.LEONARDX_STAGING_URL?.replace(/\/$/, '');
const secret = process.env.CRON_SECRET || '';
const enabled = process.env.LEONARDX_ALLOW_STAGING_LOAD === 'true';
const concurrency = Math.max(1, Math.min(5, Number(process.env.LEONARDX_WORKER_LOAD_CONCURRENCY || 2)));
const seconds = Math.max(5, Math.min(60, Number(process.env.LEONARDX_WORKER_LOAD_SECONDS || 15)));
if (!baseUrl || !enabled || secret.length < 32) { console.error('Refusing to run: set a non-production staging URL, LEONARDX_ALLOW_STAGING_LOAD=true, and a staging-only CRON_SECRET.'); process.exit(2); }
const target = new URL(baseUrl);
if (target.protocol !== 'https:' || /(^|\.)vercel\.app$/i.test(target.hostname) && !target.hostname.includes('staging')) { console.error('Refusing to load-test a production-looking URL.'); process.exit(2); }
const stop = Date.now() + seconds * 1000; const rows = [];
await Promise.all(Array.from({ length: concurrency }, async () => { while (Date.now() < stop) { const start = performance.now(); try { const r = await fetch(`${baseUrl}/api/internal/workforce/worker`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(65000), cache: 'no-store' }); rows.push({ status: r.status, ms: Math.round(performance.now() - start) }); await r.arrayBuffer(); } catch (e) { rows.push({ status: 0, error: e instanceof Error ? e.name : 'error', ms: Math.round(performance.now() - start) }); } } }));
const sorted = rows.map(r => r.ms).sort((a,b) => a-b); const pct = p => sorted.length ? sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*p))] : null;
console.log(JSON.stringify({ baseUrl, concurrency, seconds, requests: rows.length, statuses: Object.fromEntries([...new Set(rows.map(r => r.status))].map(s => [s, rows.filter(r => r.status === s).length])), p50_ms: pct(.5), p95_ms: pct(.95), p99_ms: pct(.99), warning: 'Use only a disposable staging environment with non-production data and provider limits.' }, null, 2));
