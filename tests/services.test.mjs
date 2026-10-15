import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public services page presents the configured service offers and contact path', async () => {
  const page = await read('app/services/page.tsx');
  const services = await read('data/site.ts');
  assert.match(page, /siteData\.services\.map/);
  assert.match(page, /Discuss your project/);
  assert.match(page, /clear scope and a conversation/);
  assert.match(services, /AI Mockup/);
  assert.match(services, /LEO OS Builder/);
  assert.match(services, /Code Review/);
});

test('public navigation and legacy portfolio URL direct visitors to services', async () => {
  const header = await read('components/Header.tsx');
  const footer = await read('components/Footer.tsx');
  const sidebar = await read('components/LEOAppShell.tsx');
  const config = await read('next.config.js');
  const sitemap = await read('app/sitemap.ts');

  assert.match(header, /\['Services','\/services'\]/);
  assert.match(footer, /href="\/services">Services/);
  assert.match(sidebar, /\['Services','\/services',Sparkles\]/);
  assert.match(config, /source: '\/portfolio', destination: '\/services', permanent: true/);
  assert.match(sitemap, /path: '\/services'/);
  assert.doesNotMatch(sitemap, /path: '\/portfolio'/);
});

test('about page describes the service business rather than a personal portfolio', async () => {
  const about = await read('app/about/page.tsx');
  assert.match(about, /Digital services built around what your business needs/);
  assert.match(about, /Explore services/);
  assert.doesNotMatch(about, /My portfolio|View portfolio|developer portfolio/i);
});
