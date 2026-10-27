import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('AdSense loader is globally included from the root layout and ads.txt matches publisher', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const adsTxt = readFileSync(new URL('../public/ads.txt', import.meta.url), 'utf8');
  assert.match(layout, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-8872751811502892/);
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(adsTxt, /^google\.com, pub-8872751811502892, DIRECT, f08c47fec0942fa0\s*$/);
});
