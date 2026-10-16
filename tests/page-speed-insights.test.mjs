import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPageSpeedRequestUrl,
  normalizePageSpeedResponse,
  runPageSpeedAudit,
} from '../lib/page-speed-insights.ts';

const report = {
  lighthouseResult: {
    lighthouseVersion: '12.0.0',
    categories: {
      performance: { score: 0.91 },
      accessibility: { score: 0.88 },
      'best-practices': { score: 1 },
      seo: { score: 0.73 },
    },
    audits: {
      'largest-contentful-paint': { displayValue: '2.3 s', score: 0.8 },
      'unused-javascript': {
        title: 'Reduce unused JavaScript',
        description: 'Potential savings: <strong>300 ms</strong>',
        displayValue: '300 ms',
        score: 0.4,
        details: { type: 'opportunity' },
      },
      'color-contrast': {
        title: 'Improve contrast',
        score: 0.2,
        details: { type: 'table' },
      },
    },
  },
};

test('builds the mobile/desktop PageSpeed request without losing query parameters', () => {
  const url = buildPageSpeedRequestUrl('https://example.com/a?b=c', 'mobile', 'secret value');
  assert.equal(url.searchParams.get('url'), 'https://example.com/a?b=c');
  assert.equal(url.searchParams.get('strategy'), 'mobile');
  assert.equal(url.searchParams.get('key'), 'secret value');
  assert.deepEqual(url.searchParams.getAll('category'), ['performance', 'accessibility', 'best-practices', 'seo']);
});

test('normalizes Lighthouse scores, metrics, and opportunity recommendations', () => {
  const result = normalizePageSpeedResponse(report, 'desktop');
  assert.equal(result.strategy, 'desktop');
  assert.deepEqual(result.scores, { performance: 91, accessibility: 88, bestPractices: 100, seo: 73 });
  assert.deepEqual(result.metrics.map(metric => metric.id), ['largest-contentful-paint']);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].description, 'Potential savings: 300 ms');
});

test('surfaces Google API quota/configuration errors clearly', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 403 });
  try {
    await assert.rejects(
      runPageSpeedAudit('https://example.com', 'mobile'),
      error => error.statusCode === 503 && error.message.includes('PAGESPEED_INSIGHTS_API_KEY'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
