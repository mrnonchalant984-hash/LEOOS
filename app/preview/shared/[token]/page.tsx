import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import { adminSupabase } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared Braverton Preview', robots: { index: false, follow: false } };
type Context = { params: Promise<{ token: string }> };

export default async function SharedPreviewPage({ params }: Context) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) notFound();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await adminSupabase()
    .from('bram_preview_shares')
    .select('preview_url, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at) <= new Date()) notFound();
  let previewUrl: URL;
  try { previewUrl = new URL(data.preview_url); } catch { notFound(); }
  if (previewUrl.protocol !== 'https:') notFound();

  return (
    <main className="flex min-h-screen flex-col bg-[#101114] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-300">Braverton</p><h1 className="mt-1 text-sm font-semibold">Shared project preview</h1></div>
        <p className="text-xs text-zinc-400">Expires {new Date(data.expires_at).toLocaleString()}</p>
      </header>
      <section className="flex-1 p-3 sm:p-5">
        <iframe title="Shared project preview" src={previewUrl.toString()} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms" className="h-[calc(100vh-110px)] min-h-[480px] w-full rounded-xl border border-white/10 bg-white" />
      </section>
    </main>
  );
}
