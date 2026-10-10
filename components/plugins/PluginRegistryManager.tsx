'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';

type PluginRecord = {
  plugin_id: string;
  version: string;
  api_version: string;
  manifest: { name?: string; description?: string };
  status: 'registered' | 'enabled' | 'disabled' | 'deprecated';
  created_at: string;
};

async function fetchPluginRegistry(): Promise<PluginRecord[]> {
  const response = await fetch('/api/plugins?include=all', { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Owner access is required to manage manifests.');
  return Array.isArray(result.plugins) ? result.plugins as PluginRecord[] : [];
}

const sampleManifest = JSON.stringify({
  id: 'sample-adapter',
  name: 'Sample adapter',
  version: '1.0.0',
  apiVersion: '1',
  description: 'Example manifest contract only; this is not a connected plugin.',
  permissions: ['projects:read'],
  entrypoint: 'https://plugins.example.com/adapter',
}, null, 2);

export function PluginRegistryManager() {
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [manifest, setManifest] = useState(sampleManifest);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    try {
      setPlugins(await fetchPluginRegistry());
      setAvailable(true);
    } catch (cause) {
      setAvailable(false);
      setError(cause instanceof Error ? cause.message : 'Plugin registry could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchPluginRegistry()
      .then((items) => {
        if (!active) return;
        setPlugins(items);
        setAvailable(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setAvailable(false);
        setError(cause instanceof Error ? cause.message : 'Plugin registry could not be loaded.');
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(manifest); } catch { throw new Error('Manifest must be valid JSON.'); }
      const response = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Manifest could not be registered.');
      setNotice('Manifest registered. It remains inactive until enabled by an owner.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Manifest could not be registered.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(plugin: PluginRecord, status: PluginRecord['status']) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.plugin_id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: plugin.version, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lifecycle status could not be changed.');
      setNotice(`${plugin.plugin_id} ${plugin.version} is now ${status}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lifecycle status could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-3 rounded-2xl border border-white/10 bg-zinc-950 p-5" aria-labelledby="plugin-manager-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-amber-200"/><h2 id="plugin-manager-title" className="font-semibold">Registry controls</h2></div><p className="mt-1 text-xs leading-5 text-zinc-500">Owner 2FA required. Manifests store permissions and metadata only; they do not install or execute code.</p></div>
      <button type="button" onClick={() => { setError(''); setBusy(true); void load(); }} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50"><RefreshCw size={13}/> Refresh</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-950/20 p-3 text-sm text-emerald-200">{notice}</p>}
    {!available && <p className="mt-3 text-xs text-zinc-500">If you are the platform owner, sign in and complete owner 2FA. Registry reads also require the pending database migration to be applied.</p>}
    {available && <>
      <form onSubmit={register} className="mt-5 space-y-3">
        <label htmlFor="plugin-manifest" className="block text-xs font-medium text-zinc-300">Manifest JSON <span className="font-normal text-zinc-500">(example only; not registered until submitted)</span></label>
        <textarea id="plugin-manifest" value={manifest} onChange={(event) => setManifest(event.target.value)} spellCheck={false} className="min-h-52 w-full rounded-xl border border-white/10 bg-black p-3 font-mono text-xs leading-5 text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200" />
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? 'Saving…' : 'Register manifest'}</button>
      </form>
      <div className="mt-6 border-t border-white/10 pt-5">
        <h3 className="text-sm font-semibold">Registered versions</h3>
        {plugins.length ? <ul className="mt-3 divide-y divide-white/10">{plugins.map((plugin) => <li key={`${plugin.plugin_id}@${plugin.version}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><strong className="text-sm">{plugin.manifest.name || plugin.plugin_id}</strong><p className="mt-1 text-xs text-zinc-500">{plugin.plugin_id} · v{plugin.version} · {plugin.status}</p></div>
          <div className="flex flex-wrap gap-2">
            {(['enabled', 'disabled', 'deprecated'] as const).filter((status) => status !== plugin.status).map((status) => <button type="button" key={status} disabled={busy} onClick={() => void changeStatus(plugin, status)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50">Set {status}</button>)}
          </div>
        </li>)}</ul> : <p className="mt-3 text-sm text-zinc-500">No manifest versions registered.</p>}
      </div>
    </>}
  </section>;
}
