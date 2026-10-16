import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountSecuritySettings } from '@/components/AccountSecuritySettings';
import { LEOAppShell } from '@/components/LEOAppShell';
import { getUserAccess } from '@/lib/auth';

export const metadata: Metadata = { title: 'Account settings | LeonardX' };
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
      <AccountSecuritySettings email={access.user.email || ''} fullName={access.profile?.full_name || ''}/>
    </div>
  </LEOAppShell>;
}
