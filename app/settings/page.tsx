import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountSecuritySettings } from '@/components/AccountSecuritySettings';
import { LEOAppShell } from '@/components/LEOAppShell';
import { getUserAccess } from '@/lib/auth';
import { createNoIndexMetadata } from '@/lib/seo';
import Link from 'next/link';

export const metadata: Metadata = {
  ...createNoIndexMetadata(),
  title: 'Account settings',
  description: 'Manage your private LeonardX account and security settings.',
};
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const access = await getUserAccess();
  if (!access) redirect('/auth?next=%2Fsettings');

  return <LEOAppShell title="Settings" subtitle="Manage your LeonardX account and security.">
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--gold)]">Account</p>
        <h1 className="mt-2 text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Manage your account identity and sign-in protection.</p>
      </header>
      <Link href="/settings/ai" className="block rounded-2xl border border-white/10 bg-white/[.03] p-4 transition hover:bg-white/[.06]">
        <span className="font-semibold">AI provider diagnostics</span>
        <span className="mt-1 block text-sm text-zinc-400">Check server-reported model and Gemini configuration status without exposing secrets.</span>
      </Link>
      <AccountSecuritySettings email={access.user.email || ''} fullName={access.profile?.full_name || ''}/>
    </div>
  </LEOAppShell>;
}
