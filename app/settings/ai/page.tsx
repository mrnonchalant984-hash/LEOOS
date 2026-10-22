import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LEOAppShell } from '@/components/LEOAppShell';
import { AIProviderStatus } from '@/components/AIProviderStatus';
import { getUserAccess } from '@/lib/auth';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = { ...createNoIndexMetadata(), title: 'AI provider status | LeonardX', description: 'Inspect server-reported AI provider configuration status.' };
export const dynamic = 'force-dynamic';

export default async function AIProviderSettingsPage() {
  const access = await getUserAccess();
  if (!access) redirect('/auth?next=%2Fsettings%2Fai');
  return <LEOAppShell title="AI provider status" subtitle="Inspect provider configuration without exposing secrets.">
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--gold)]">Diagnostics</p><h1 className="mt-2 text-3xl font-bold">AI providers</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Read-only status view. Configure secrets in server environment settings, never in the browser.</p></header>
      <AIProviderStatus />
    </div>
  </LEOAppShell>;
}
