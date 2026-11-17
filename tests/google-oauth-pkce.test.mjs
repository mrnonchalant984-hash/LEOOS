import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Google OAuth uses one canonical, uncached server-side PKCE flow', async () => {
  const form = await read('components/AuthForm.tsx');
  const start = await read('app/api/auth/google/start/route.ts');
  const callback = await read('app/api/auth/google/callback/route.ts');
  const page = await read('app/auth/callback/page.tsx');

  assert.match(form, /\/api\/auth\/google\/start/);
  assert.doesNotMatch(form, /signInWithOAuth/);
  assert.match(start, /PUBLIC_ORIGIN = 'https:\/\/leoos-omega\.vercel\.app'/);
  assert.match(start, /createServerClient/);
  assert.match(start, /signInWithOAuth/);
  assert.match(start, /setAll\(cookiesToSet\)/);
  assert.match(start, /response\.cookies\.set/);
  assert.match(start, /Cache-Control/);
  assert.match(start, /\/api\/auth\/google\/callback/);

  assert.match(callback, /PUBLIC_ORIGIN = 'https:\/\/leoos-omega\.vercel\.app'/);
  assert.match(callback, /export async function GET/);
  assert.match(callback, /createServerClient/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /request\.cookies\.getAll\(\)/);
  assert.match(callback, /response\.cookies\.set/);
  assert.match(callback, /Cache-Control/);
  assert.match(callback, /oauth', 'complete'/);

  assert.match(page, /supabase\.auth\.getSession\(\)/);
  assert.match(page, /\/api\/auth\/session/);
  assert.match(page, /\/api\/auth\/profile/);
});
