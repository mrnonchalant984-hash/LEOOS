import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('global and homepage metadata use the production origin, social image, and structured data', () => {
  const layout = read('../app/layout.tsx');
  const home = read('../app/page.tsx');
  assert.match(read('../lib/seo.ts'), /SITE_ORIGIN = 'https:\/\/leoos-omega\.vercel\.app'/);
  assert.match(layout, /metadataBase: new URL\(SITE_ORIGIN\)/);
  assert.match(home, /title: \{ absolute: SITE_TITLE \}/);
  assert.match(layout, /googleBot:[\s\S]*index: true[\s\S]*follow: true/);
  assert.match(layout, /openGraph:[\s\S]*type: 'website'/);
  assert.match(layout, /twitter:[\s\S]*summary_large_image/);
  assert.match(layout, /Organization/);
  assert.match(layout, /WebSite/);
  assert.match(home, /SoftwareApplication/);
  assert.match(home, /FAQPage/);
  assert.ok(fs.existsSync(new URL('../public/leonardx-og.png', import.meta.url)));
});

test('sitemap lists real public pages and excludes private app surfaces', () => {
  const sitemap = read('../app/sitemap.ts');
  const paths = [...sitemap.matchAll(/path: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(paths.includes('/'));
  assert.ok(paths.includes('/leo-ai'));
  assert.ok(paths.includes('/pricing'));
  assert.ok(paths.includes('/blog'));
  assert.ok(paths.includes('/projects'));
  assert.ok(paths.includes('/docs/api'));
  assert.ok(!paths.includes('/portfolio'));
  for (const forbidden of ['/admin', '/dashboard', '/account', '/auth', '/api-keys', '/app', '/workflows']) {
    assert.ok(!paths.includes(forbidden), `private route should not be listed: ${forbidden}`);
  }
  for (const route of paths) {
    const page = route === '/' ? '../app/page.tsx' : `../app${route}/page.tsx`;
    assert.ok(fs.existsSync(new URL(page, import.meta.url)), `sitemap route is missing a page: ${route}`);
  }
  assert.match(sitemap, /LEO_TEMPLATES\.map/);
  assert.match(sitemap, /big12Projects\.map/);
  assert.match(read('../app/templates/[id]/page.tsx'), /generateStaticParams/);
  assert.match(read('../app/projects/[slug]/page.tsx'), /generateStaticParams/);
});

test('robots exposes the canonical sitemap and blocks API endpoints while noindex pages remain crawlable', () => {
  const robots = read('../app/robots.ts');
  assert.match(robots, /sitemap: `\$\{SITE_ORIGIN\}\/sitemap\.xml`/);
  assert.match(robots, /disallow: \[[^\]]*'\/api\/'/);
  assert.doesNotMatch(robots, /'\/dashboard'/);
  const privateLayout = read('../app/dashboard/layout.tsx');
  assert.match(privateLayout, /index: false/);
  assert.match(read('../app/workflows/layout.tsx'), /createNoIndexMetadata/);
  assert.match(read('../lib/seo.ts'), /index: false, follow: false/);
});

test('homepage and Leo AI landing page have visible FAQ content and FAQ schema', () => {
  const home = read('../app/page.tsx');
  const leo = read('../app/leo-ai/page.tsx');
  assert.match(home, /FAQPage/);
  assert.match(home, /COMMON QUESTIONS/);
  assert.match(leo, /FAQPage/);
  assert.match(leo, /Frequently asked questions/);
  assert.match(leo, /path: "\/leo-ai"/);
  assert.match(read('../app/blog/freelancers-ai-10x/page.tsx'), /BlogPosting/);
});
