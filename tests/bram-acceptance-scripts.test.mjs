import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const acceptance = readFileSync(new URL('../scripts/bram-productivity-acceptance.mjs', import.meta.url), 'utf8');
const web3 = readFileSync(new URL('../scripts/verify-web3forms.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('Bram acceptance suite refuses production hosts and requires an exact staging host', () => {
  assert.match(acceptance, /BRAM_E2E_ALLOW_NON_PRODUCTION !== '1'/);
  assert.match(acceptance, /BRAM_E2E_EXPECTED_HOST/);
  assert.match(acceptance, /origin\.hostname !== expectedHost/);
  assert.match(acceptance, /Refusing to run destructive acceptance tests against a production hostname/);
  assert.match(acceptance, /endsWith\('-mrnonchalant984-hash\.vercel\.app'\)/);
  assert.match(acceptance, /finally/);
});

test('Bram acceptance suite exercises authenticated reminders, calendar CRUD, and source review', () => {
  for (const path of ['/api/bram/reminders', '/api/bram/calendar', '/api/file-review']) assert.ok(acceptance.includes(path));
  assert.match(acceptance, /PASS authenticated reminder create\/list\/cancel/);
  assert.match(acceptance, /PASS authenticated calendar create\/list\/update\/delete/);
  assert.match(acceptance, /PASS authenticated source-review execution/);
});

test('Web3Forms live delivery test requires explicit confirmation and never logs the access key', () => {
  assert.match(web3, /WEB3FORMS_TEST_CONFIRM !== 'SEND'/);
  assert.match(web3, /api\.web3forms\.com\/submit/);
  assert.match(web3, /result\.success !== true/);
  assert.doesNotMatch(web3, /console\.log\([^\n]*accessKey/);
  assert.equal(pkg.scripts['test:bram:acceptance'], 'node scripts/bram-productivity-acceptance.mjs');
  assert.equal(pkg.scripts['verify:web3forms'], 'node scripts/verify-web3forms.mjs');
});
