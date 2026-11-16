import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('profile onboarding is persisted as profile data and keeps authorization role separate', async () => {
  const migration = await read('supabase/migrations/20261116190000_unified_profile_onboarding.sql');
  const route = await read('app/api/auth/profile/route.ts');
  const auth = await read('components/AuthForm.tsx');
  const callback = await read('app/auth/callback/page.tsx');
  assert.match(migration, /onboarding_completed boolean not null default false/i);
  assert.match(migration, /onboarding_role text/i);
  assert.match(migration, /company_size text/i);
  assert.match(migration, /theme_preference text/i);
  assert.match(migration, /email_opt_out boolean/i);
  assert.match(route, /updates\.onboarding_completed = true/);
  assert.match(route, /onboarding_role/);
  assert.match(auth, /result\.user\.onboarding_completed !== true[\s\S]*'\/getting-started'/);
  assert.match(callback, /onboarding_completed === true[\s\S]*'\/getting-started'/);
});

test('getting-started saves four onboarding steps and applies the saved theme', async () => {
  const page = await read('app/getting-started/page.tsx');
  const theme = await read('components/theme-provider.tsx');
  assert.match(page, /STEP \{step \+ 1\} OF 4/);
  assert.match(page, /onboarding_completed: true/);
  assert.match(page, /email_opt_out: emailOptOut/);
  assert.match(page, /company_size: companySize/);
  assert.match(page, /theme_preference: theme/);
  assert.match(page, /setTheme\(theme\)/);
  assert.match(theme, /fetch\('\/api\/auth\/profile'/);
});

test('Paystack generator creates server-side checkout, verification, webhook and client button files', async () => {
  const generator = await read('lib/paystack-integration-generator.ts');
  const component = await read('components/ide/PaystackIntegrationGenerator.tsx');
  const ide = await read('components/ide/WebIde.tsx');
  assert.match(generator, /PAYSTACK_SECRET_KEY/);
  assert.match(generator, /transaction\/initialize/);
  assert.match(generator, /transaction\/verify/);
  assert.match(generator, /createHmac\("sha512"/);
  assert.match(generator, /timingSafeEqual/);
  assert.match(generator, /PaystackCheckoutButton/);
  assert.match(generator, /PAYSTACK-INTEGRATION\.md/);
  assert.match(component, /generatePaystackIntegrationFiles/);
  assert.match(ide, /PaystackIntegrationGenerator existingFiles/);
});

test('GitHub importer exposes branch selection and validates the archive host', async () => {
  const route = await read('app/api/workspaces/[id]/github-import/route.ts');
  const component = await read('components/ide/GitHubRepositoryImporter.tsx');
  assert.match(route, /export async function GET/);
  assert.match(route, /branches\?per_page=50/);
  assert.match(route, /body\?\.branch/);
  assert.match(route, /codeload\.github\.com/);
  assert.match(route, /importWorkspaceZip/);
  assert.match(component, /Load branches/);
  assert.match(component, /Import selected branch/);
});

test('live IDE embeds Leo with the active project context and retains ZIP import', async () => {
  const ide = await read('components/ide/WebIde.tsx');
  const leo = await read('components/LEOWidget.tsx');
  assert.match(ide, /LEOWidget full embedded[\s\S]*initialProjectId=\{workspaceId\}/);
  assert.match(leo, /initialProjectId/);
  assert.match(leo, /setWorkspaceMode\("work"\)/);
  assert.match(ide, /Import ZIP/);
  assert.match(ide, /GitHubRepositoryImporter/);
});
