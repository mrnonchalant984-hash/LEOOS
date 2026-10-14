import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('workspace sidebar keeps public marketing pages out of the product navigation', async () => {
  const shell = await read('components/LEOAppShell.tsx');
  assert.match(shell, /\[\.\.\.groups, \.\.\.\(isOwner \? \[adminGroup\] : \[\]\)\]/);
  assert.doesNotMatch(shell, /\[\.\.\.groups, publicGroup, \.\.\.\(isOwner \? \[adminGroup\] : \[\]\)\]/);
  assert.match(shell, /\['Developer API','\/developers\/pricing',Wallet\]/);
});

test('nested workspace routes select the most specific navigation item', async () => {
  const shell = await read('components/LEOAppShell.tsx');
  assert.match(shell, /\.sort\(\(a, b\) => b\.length - a\.length\)\[0\]/);
  assert.match(shell, /const active = href === activeHref/);
});

test('Developer API pricing presents separate plans and free-key activation rules', async () => {
  const apiPricing = await read('app/developers/pricing/page.tsx');
  const catalog = await read('lib/api-plan-catalog.ts');
  const endpoint = await read('app/api/v1/billing/plans/route.ts');
  const leoPricing = await read('app/pricing/page.tsx');
  assert.match(apiPricing, /ApiPlanChooser/);
  assert.match(apiPricing, /Create and keep your API key for free/);
  assert.doesNotMatch(apiPricing, /checkout remains disabled|internal billing state/i);
  assert.match(catalog, /API_PLAN_CHECKOUT_ENABLED = true/);
  assert.match(catalog, /monthlyNgn: 9_900/);
  assert.match(endpoint, /API_PLAN_CATALOG/);
  assert.match(endpoint, /active paid plan and available credits/);
  assert.match(leoPricing, /Developer API billing is separate/);
  assert.match(leoPricing, /href="\/developers\/pricing"/);
});
