'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <html lang="en"><body className="min-h-screen bg-[#070707] text-zinc-100">
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-100/70">LEONARDX · LEO OS</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">The page could not finish loading. Your account and project data have not been changed by this error.</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-zinc-500">Reference: {error.digest}</p>}
      <button type="button" onClick={retry} className="mt-7 w-fit rounded-lg bg-amber-100 px-4 py-2.5 text-sm font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Try again</button>
    </main>
  </body></html>;
}
