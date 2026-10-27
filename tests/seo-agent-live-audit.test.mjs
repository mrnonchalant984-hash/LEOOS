import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSeoAudit } from '../lib/agents/seo-audit.ts';

const goodHtml = `<!doctype html><html lang="en"><head>
<title>Example Site | Useful Software</title>
<meta name="description" content="A clear and useful description of this public example website for visitors and search engines." />
<link rel="canonical" href="https://example.com/" />
<meta name="robots" content="index, follow" />
<meta property="og:title" content="Example Site" />
<meta property="og:description" content="Example description" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
</head><body><main><h1>Example Site</h1><h2>About</h2><img src="/logo.png" alt="Example logo"/><a href="/about">About</a></main></body></html>`;

function fetchers(html = goodHtml) {
  return {
    async fetchHtml(url) { return { status: 200, headers: { 'content-type': 'text/html' }, html, url: 'https://example.com/' }; },
    async fetchText(url) {
      if (url.endsWith('/robots.txt')) return { status: 200, headers: { 'content-type': 'text/plain' }, html: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml', url };
      return { status: 200, headers: { 'content-type': 'application/xml' }, html: '<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about</loc></url></urlset>', url };
    },
  };
}

test('SEO agent audits real public-site signals without invoking a text provider', async () => {
  const report = await runSeoAudit('Audit https://github.com/example/repo and https://example.com/', fetchers());
  assert.equal(report.status, 'completed');
  assert.equal(report.url, 'https://example.com/');
  assert.equal(report.http_status, 200);
  assert.equal(report.page.title, 'Example Site | Useful Software');
  assert.equal(report.page.canonical, 'https://example.com/');
  assert.equal(report.page.h1.length, 1);
  assert.equal(report.page.json_ld_scripts, 1);
  assert.equal(report.crawl.sitemap_url_count, 2);
  assert.equal(report.adsense.status, 'not_detected');
  assert.equal(report.performance.status, 'not_measured');
  assert.equal(report.search_console.status, 'not_accessible');
});

test('SEO agent flags missing metadata, headings and image alternatives with evidence', async () => {
  const html = '<html><head><meta name="robots" content="noindex, nofollow"></head><body><h1>One</h1><h1>Two</h1><img src="/missing-alt.png"><a href="/about">About</a></body></html>';
  const report = await runSeoAudit('Audit https://example.com/', fetchers(html));
  const codes = report.findings.map(item => item.code);
  assert.ok(codes.includes('missing_title'));
  assert.ok(codes.includes('missing_description'));
  assert.ok(codes.includes('missing_canonical'));
  assert.ok(codes.includes('h1_count'));
  assert.ok(codes.includes('image_alt'));
  assert.ok(codes.includes('page_noindex'));
});

test('SEO agent refuses to invent a target URL', async () => {
  const report = await runSeoAudit('Audit the site for SEO', fetchers());
  assert.deepEqual(report, { status: 'failed', error_code: 'seo_target_missing', message: 'Include a public website URL in the task.' });
});
