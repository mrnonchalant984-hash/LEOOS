'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Attach the current Supabase access token to same-origin API requests. */
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = new Headers(init.headers);
  if (url && key) {
    browserClient ??= createBrowserClient(url, key);
    const { data: { session } } = await browserClient.auth.getSession();
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  return fetch(input, { ...init, headers, cache: init.cache ?? 'no-store' });
}
