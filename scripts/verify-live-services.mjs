/**
 * Read-only live integration smoke checks. Never prints credential values.
 * Use a staging deployment and staging-only service URLs/tokens.
 */
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const timeout = 10000;

async function probe(name, rawUrl, path, expected = 200) {
  if (!rawUrl) {
    add(name, false, 'Not configured; set the documented service URL before release verification.');
    return;
  }
  let url;
  try { url = new URL(rawUrl); }
  catch { add(name, false, 'Configured URL is invalid.'); return; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    add(name, false, 'URL must use HTTP(S) and contain no embedded credentials, query, or fragment.');
    return;
  }
  try {
    const response = await fetch(new URL(path, url.toString().replace(/\/$/, '') + '/'), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeout),
    });
    const ok = response.status === expected;
    const detail = `HTTP ${response.status}`;
    add(name, ok, detail);
  } catch (error) {
    add(name, false, error instanceof Error ? error.name : 'request_failed');
  }
}

const staging = process.env.LEONARDX_STAGING_URL?.trim();
if (!staging) {
  add('application-readiness', false, 'Set LEONARDX_STAGING_URL to a dedicated staging deployment.');
} else {
  const parsed = new URL(staging);
  if (parsed.protocol !== 'https:' || /(^|\.)vercel\.app$/i.test(parsed.hostname) && !parsed.hostname.includes('staging')) {
    add('application-readiness', false, 'Refusing production-looking URL; use an HTTPS staging URL.');
  } else {
    await probe('application-health', staging, '/api/health');
    await probe('application-readiness', staging, '/api/health/ready');
  }
}

const runnerUrl = process.env.REPOSITORY_RUNNER_URL?.trim();
if (runnerUrl) await probe('repository-runner', runnerUrl, '/health');
else add('repository-runner', false, 'REPOSITORY_RUNNER_URL is not configured; runner-dependent builds remain blocked.');


const report = {
  mode: 'read-only-live-smoke',
  timestamp: new Date().toISOString(),
  checks,
  passed: checks.filter((item) => item.ok).length,
  failed_or_blocked: checks.filter((item) => !item.ok).length,
  note: 'Health checks do not prove successful project creation, browser gameplay, cross-tenant security, or deployment. Those require isolated staging acceptance tests and real provider credentials.',
};
console.log(JSON.stringify(report, null, 2));
if (checks.some((item) => !item.ok)) process.exitCode = 1;
