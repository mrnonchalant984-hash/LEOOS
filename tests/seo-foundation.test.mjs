import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('global metadata includes canonical base, crawler directives, social cards and structured data', () => {
  const layout = read('../app/layout.tsx');
  assert.match(layout, /const siteUrl = 'https:\/\/leoos-omega\.vercel\.app'/);
  assert.match(layout, /metadataBase: new URL\(siteUrl\)/);
  assert.match(layout, /googleBot:[\s\S]*index: true[\s\S]*follow: true/);
  assert.match(layout, /openGraph:[\s\S]*type: 'website'/);
  assert.match(layout, /twitter:[\s\S]*summary_large_image/);
  assert.match(layout, /Organization/);
  assert.match(layout, /WebSite/);
  assert.match(layout, /SoftwareApplication/);
});

test('sitemap lists real public pages and excludes private app surfaces', () => {
  const sitemap = read('../app/sitemap.ts');
  const paths = [...sitemap.matchAll(/path: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(paths.includes('/'));
  assert.ok(paths.includes('/leo-ai'));
  assert.ok(paths.includes('/pricing'));
  assert.ok(paths.includes('/blog'));
  for (const forbidden of ['/admin', '/dashboard', '/account', '/auth', '/api-keys', '/app']) {
    assert.ok(!paths.includes(forbidden), `private route should not be listed: ${forbidden}`);
  }
  for (const route of paths) {
    const page = route === '/' ? '../app/page.tsx' : `../app${route}/page.tsx`;
    assert.ok(fs.existsSync(new URL(page, import.meta.url)), `sitemap route is missing a page: ${route}`);
  }
});

test('robots exposes sitemap and blocks private and API routes from crawling', () => {
  const robots = read('../app/robots.ts');
  assert.match(robots, /sitemap: `\$\{SITE_URL\}\/sitemap\.xml`/);
  assert.match(robots, /disallow: \[[^\]]*'\/api\/'/);
  assert.doesNotMatch(robots, /'\/dashboard'/);
  const privateLayout = read('../app/dashboard/layout.tsx');
  assert.match(privateLayout, /index: false/);
});

test('homepage and Leo AI landing page have visible FAQ content and FAQ schema', () => {
  const home = read('../app/page.tsx');
  const leo = read('../app/leo-ai/page.tsx');
  assert.match(home, /FAQPage/);
  assert.match(home, /COMMON QUESTIONS/);
  assert.match(leo, /FAQPage/);
  assert.match(leo, /Frequently asked questions/);
  assert.match(leo, /alternates: \{ canonical: '\/leo-ai' \}/);
});
