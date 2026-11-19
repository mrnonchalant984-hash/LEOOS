import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string }> };

export default async function SharedPreviewPage({ params }: Context) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await adminSupabase()
    .from('bram_preview_shares')
    .select('preview_url,expires_at,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) notFound();
  let target: URL;
  try { target = new URL(data.preview_url); } catch { notFound(); }
  if (target.protocol !== 'https:' || target.username || target.password) notFound();

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div><p className="text-sm font-semibold">Braverton</p><p className="text-xs text-slate-400">Shared project preview · read-only</p></div>
        <a href={target.toString()} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10">Open preview ↗</a>
      </header>
      <section className="flex-1 p-3 sm:p-5">
        <iframe title="Shared Braverton project preview" src={target.toString()} loading="eager" sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-[calc(100vh-100px)] min-h-[420px] w-full rounded-xl border border-white/10 bg-white" />
      </section>
    </main>
  );
}
