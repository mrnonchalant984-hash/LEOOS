import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('production owner email is documented without exposing it as a public variable', () => {
  const env = read('.env.example');
  const docs = read('docs/production-environment-setup.md');
  assert.match(env, /^OWNER_EMAIL=leonardudoh5@gmail\.com$/m);
  assert.match(docs, /OWNER_EMAIL=leonardudoh5@gmail\.com/);
  assert.match(docs, /does not create an admin account or bypass authentication/i);
});

test('CI uses placeholders instead of production credentials', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /SUPABASE_SERVICE_ROLE_KEY: ci-placeholder-service-role-key/);
  assert.match(ci, /OPENAI_API_KEY: ci-placeholder-key/);
  assert.doesNotMatch(ci, /\$\{\{\s*secrets\.(PAYSTACK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY)\s*\}\}/);
});

test('lead capture treats Resend as optional after successful database persistence', () => {
  const route = read('app/api/lead/route.ts');
  assert.match(route, /if \(!destination\) return false/);
  assert.match(route, /sendSmtpMail/);
  assert.match(route, /if \(!apiKey\) return false/);
  assert.match(route, /saved: true, emailSent, notification:/);
  assert.doesNotMatch(route, /if\(!emailSent\)return NextResponse\.json\(\{error:'Lead saved, but email notification is not configured yet\.'/);
});
