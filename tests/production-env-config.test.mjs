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
  assert.match(ci, /GEMINI_API_KEY: ci-placeholder-key/);
  assert.doesNotMatch(ci, /\$\{\{\s*secrets\.(PAYSTACK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY)\s*\}\}/);
});

test('Bram lead capture persists once and sends the owner notification through Web3Forms', () => {
  const route = read('app/api/lead/route.ts');
  const capture = read('components/LeadCapture.tsx');
  assert.match(route, /saved: true/);
  assert.match(route, /enforceIpRateLimit/);
  assert.doesNotMatch(route, /process\.env\.(?:RESEND_API_KEY|SMTP_HOST|SMTP_USER)|api\.resend\.com|sendSmtpMail/);
  assert.match(capture, /api\.web3forms\.com\/submit/);
  assert.match(capture, /NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY/);
  assert.match(capture, /New Braverton lead captured by Bram/);
  assert.match(capture, /leadSaved/);
  assert.match(capture, /web3Result\.success !== true/);
});
