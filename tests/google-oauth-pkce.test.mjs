import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Google OAuth starts and completes on the server with the same PKCE cookie store', async () => {
  const form = await read('components/AuthForm.tsx');
  const start = await read('app/api/auth/google/start/route.ts');
  const callback = await read('app/api/auth/google/callback/route.ts');
  const page = await read('app/auth/callback/page.tsx');

  assert.match(form, /\/api\/auth\/google\/start/);
  assert.doesNotMatch(form, /signInWithOAuth/);
  assert.match(start, /createServerClient/);
  assert.match(start, /signInWithOAuth/);
  assert.match(start, /setAll\(cookiesToSet\)/);
  assert.match(start, /response\.cookies\.set/);
  assert.match(start, /\/auth\/callback/);
  assert.match(callback, /createServerClient/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /request\.cookies\.getAll\(\)/);
  assert.match(callback, /response\.cookies\.set/);
  assert.match(page, /\/api\/auth\/google\/callback/);
  assert.match(page, /supabase\.auth\.setSession\(exchangeResult\.session\)/);
  assert.match(page, /\/api\/auth\/session/);
  assert.match(page, /\/api\/auth\/profile/);
});
