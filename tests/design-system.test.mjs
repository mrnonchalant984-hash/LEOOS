import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public design tokens use the confirmed Google Forms-inspired palette', async () => {
  const css = await read('app/design-system.css');
  assert.match(css, /--lx-accent:\s*#673ab7/i);
  assert.match(css, /--lx-bg:\s*#f8f9fa/i);
  assert.match(css, /--lx-surface:\s*#ffffff/i);
  assert.match(css, /html\[data-theme='dark'\]/);
  assert.match(css, /--lx-line:\s*#e2e5e9/i);
});

test('theme preference is persisted and applied before public page styling', async () => {
  const [provider, layout] = await Promise.all([
    read('components/theme-provider.tsx'), read('app/layout.tsx'),
  ]);
  assert.match(provider, /useSyncExternalStore/);
  assert.match(provider, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(provider, /localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(provider, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(layout, /leonardx-theme/);
});

test('Google-inspired styling is scoped to public surfaces, excluding Store, developer tools and workspace', async () => {
  const [css, chrome] = await Promise.all([read('app/design-system.css'), read('components/StoreChrome.tsx')]);
  assert.match(css, /\.lx-route-scope\[data-lx-theme-scope='public'\]/);
  assert.match(chrome, /data-lx-theme-scope=\{preserveExistingVisualSystem \? 'preserve' : 'public'\}/);
  for (const prefix of ['/store', '/developers', '/docs', '/app', '/dashboard', '/projects', '/settings', '/engineering']) {
    assert.ok(chrome.includes(`'${prefix}'`), `expected preserved visual prefix ${prefix}`);
  }
  assert.doesNotMatch(css, /^html, body\s*\{/m, 'design tokens must not restyle the document globally');
});

test('Leo AI marketing route uses the shared public header and no longer carries the legacy orange palette', async () => {
  const [page, header, auth] = await Promise.all([
    read('app/leo-ai/page.tsx'), read('components/Header.tsx'), read('components/AuthForm.tsx'),
  ]);
  assert.match(page, /leo-ai-marketing/);
  assert.match(page, /leo-ai-primary/);
  assert.doesNotMatch(page, /orange-|text-zinc-|border-white\/|bg-white\/\[/);
  const hiddenPrefixes = header.match(/const appPrefixes = \[(.*?)\];/)?.[1] ?? '';
  assert.doesNotMatch(hiddenPrefixes, /'\/leo-ai'/);
  assert.match(auth, /<ThemeToggle/);
});

test('the shared workspace shell retains its existing visual system without the public theme toggle', async () => {
  const shell = await read('components/LEOAppShell.tsx');
  assert.doesNotMatch(shell, /ThemeToggle/);
});

test('every route using the existing LEO workspace shell is explicitly excluded from public restyling', async () => {
  const { readdir, readFile: readFileDirect } = await import('node:fs/promises');
  const { join, relative, sep } = await import('node:path');
  const appRoot = fileURLToPath(new URL('../app', import.meta.url));
  const [chrome, header] = await Promise.all([read('components/StoreChrome.tsx'), read('components/Header.tsx')]);
  const prefixes = [...chrome.matchAll(/'([^']+)'/g)].map(match => match[1]);
  const headerPrefixes = header.match(/const appPrefixes = \[(.*?)\];/)?.[1] ?? '';
  const headerExcluded = [...headerPrefixes.matchAll(/'([^']+)'/g)].map(match => match[1]);
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await walk(full));
      else if (entry.name === 'page.tsx') files.push(full);
    }
    return files;
  }
  const pages = await walk(appRoot);
  const shellPages = [];
  for (const file of pages) {
    const source = await readFileDirect(file, 'utf8');
    if (!source.includes('LEOAppShell')) continue;
    const route = '/' + relative(appRoot, file).split(sep).slice(0, -1).join('/').replace(/\[([^\]]+)\]/g, '{$1}');
    shellPages.push(route === '/.' ? '/' : route);
  }
  assert.ok(shellPages.length > 0);
  for (const route of shellPages) {
    const match = prefixes.some(prefix => route === prefix || route.startsWith(`${prefix}/`));
    assert.ok(match, `workspace/developer route ${route} must preserve its current visual system`);
    assert.ok(headerExcluded.some(prefix => route === prefix || route.startsWith(`${prefix}/`)), `workspace/developer route ${route} must not render the public header`);
  }
});

test('visual browser suite contains the complete 112-route inventory and covers six theme/viewport captures per route', async () => {
  const inventory = await read('tests/visual-qa-routes.csv');
  const routes = inventory.trim().split(/\r?\n/).slice(1);
  const runner = await read('scripts/visual-qa-playwright.py');
  assert.equal(routes.length, 112);
  assert.equal(new Set(routes).size, 112);
  assert.match(runner, /"desktop"/);
  assert.match(runner, /"tablet"/);
  assert.match(runner, /"mobile"/);
  assert.match(runner, /for theme in \("light", "dark"\)/);
  assert.match(runner, /screenshots_expected/);
});

test('remaining page-level hex colours are limited to explicitly preserved Store, developer and workspace surfaces', async () => {
  const { readdir, readFile: readFileDirect } = await import('node:fs/promises');
  const { join, relative, sep } = await import('node:path');
  const chrome = await read('components/StoreChrome.tsx');
  const preserved = [...chrome.matchAll(/'([^']+)'/g)].map(match => match[1]);
  preserved.push('/store');
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true }); const files=[];
    for (const entry of entries) { const full=join(dir,entry.name); if(entry.isDirectory()) files.push(...await walk(full)); else if(entry.name==='page.tsx') files.push(full); }
    return files;
  }
  const appRoot = fileURLToPath(new URL('../app', import.meta.url));
  for (const file of await walk(appRoot)) {
    const route = '/' + relative(appRoot, file).split(sep).slice(0,-1).join('/').replace(/\[([^\]]+)\]/g,'{$1}');
    const source = await readFileDirect(file,'utf8');
    if (!/#[0-9a-fA-F]{3,8}\b/.test(source)) continue;
    assert.ok(preserved.some(prefix => route === prefix || route.startsWith(`${prefix}/`)), `page-level colour literal in public route ${route} should use a design token`);
  }
});
