import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Vercel discovery helpers require stable project ids and avoid secret echo', () => {
  const hosting = read('lib/vercel-hosting.ts');
  const route = read('app/api/engineering/vercel/projects/route.ts');
  assert.match(hosting, /export async function listVercelProjects/);
  assert.match(hosting, /export async function getVercelProject/);
  assert.match(hosting, /Vercel project id is invalid/);
  assert.match(route, /Owner access required/);
  assert.match(route, /Do not deploy by ambiguous name alone/);
  assert.doesNotMatch(route, /process\.env\.VERCEL_TOKEN(?!\?\.trim)/);
});

test('secure env submit path never returns credential values', () => {
  const submit = read('app/api/engineering/config/submit/route.ts');
  const secure = read('lib/secure-env-config.ts');
  assert.match(submit, /Owner access required/);
  assert.match(submit, /Do not log body/);
  assert.match(secure, /Value is not returned/);
  assert.match(secure, /metadata:\s*\{/);
  // Response payloads expose metadata only — never echo the submitted secret.
  assert.doesNotMatch(secure, /metadata:\s*\{[\s\S]*?\bvalue:\s*input\.value/);
  assert.doesNotMatch(submit, /NextResponse\.json\(\{[\s\S]*?\bvalue:\s*(body\.value|value)/);
});
