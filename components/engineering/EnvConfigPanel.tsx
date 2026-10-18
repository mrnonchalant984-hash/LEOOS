'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { EnvTarget, EnvVariableStatus } from '@/lib/env-config-catalog';

export function EnvConfigPanel({ vercelProjectId }: { vercelProjectId?: string }) {
  const [target, setTarget] = useState<EnvTarget>('production');
  const [variables, setVariables] = useState<EnvVariableStatus[]>([]);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function token() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    return (await supabase.auth.getSession()).data.session?.access_token || null;
  }

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const access = await token();
      if (!access) throw new Error('Sign in required.');
      const params = new URLSearchParams({ target });
      if (vercelProjectId) params.set('vercelProjectId', vercelProjectId);
      const response = await fetch(`/api/engineering/config/status?${params}`, {
        headers: { Authorization: `Bearer ${access}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Configuration status unavailable.');
      setVariables(result.variables || []);
      setMissingRequired(result.missingRequired || []);
      if (!selected && result.variables?.[0]?.name) setSelected(result.variables[0].name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Configuration status unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, vercelProjectId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const access = await token();
      if (!access) throw new Error('Sign in required.');
      if (!vercelProjectId) throw new Error('Select a Vercel project id before saving remote environment variables.');
      const response = await fetch('/api/engineering/config/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: selected,
          value,
          target,
          vercelProjectId,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Configuration could not be saved.');
      setValue('');
      setMessage(result.message || 'Configured. Value is not returned.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Configuration could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const active = variables.find((item) => item.name === selected);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--gold-bright)]">Secure configuration</p>
          <h3 className="mt-2 text-lg font-bold text-white">Environment configuration manager</h3>
          <p className="mt-1 text-sm text-zinc-400">Values are submitted directly to the backend and never shown after save.</p>
        </div>
        <label className="text-xs text-zinc-400">
          Environment
          <select
            className="ml-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            value={target}
            onChange={(event) => setTarget(event.target.value as EnvTarget)}
          >
            <option value="development">Development</option>
            <option value="preview">Preview</option>
            <option value="production">Production</option>
          </select>
        </label>
      </div>

      {missingRequired.length > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Missing required variables: {missingRequired.join(', ')}
        </p>
      ) : null}

      {loading ? <p className="mt-4 text-sm text-zinc-500">Loading configuration status…</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-emerald-300">{message}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <ul className="grid max-h-[420px] gap-2 overflow-auto">
          {variables.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => setSelected(item.name)}
                className={`w-full rounded-xl border px-3 py-3 text-left ${
                  selected === item.name ? 'border-[var(--gold)]/40 bg-[var(--gold)]/10' : 'border-white/10 bg-black/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white">{item.name}</span>
                  <span className={`text-[10px] uppercase ${item.configured ? 'text-emerald-300' : item.required ? 'text-rose-300' : 'text-zinc-500'}`}>
                    {item.configured ? 'configured' : item.required ? 'required' : 'optional'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{item.purpose}</p>
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={submit} className="rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-sm font-semibold text-white">{active?.service || 'Service'}</p>
          <p className="mt-1 font-mono text-xs text-zinc-300">{selected || 'Select a variable'}</p>
          <p className="mt-2 text-xs text-zinc-500">{active?.purpose}</p>
          <label className="mt-4 block text-xs text-zinc-400">
            Secret value
            <input
              type="password"
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white"
              placeholder="Paste only into this secure field"
              required
            />
          </label>
          <p className="mt-2 text-[11px] text-zinc-500">
            Do not paste secrets into chat. {active?.restartRequired ? 'A redeploy/restart is required after save.' : 'Restart usually not required.'}
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              disabled={testing || !active}
              onClick={async () => {
                if (!active) return;
                setTesting(true);
                setError('');
                setMessage('');
                try {
                  const access = await token();
                  if (!access) throw new Error('Sign in required.');
                  const response = await fetch(`/api/setup/integrations/status?service=${encodeURIComponent(active.service)}`, {
                    headers: { Authorization: `Bearer ${access}` },
                    cache: 'no-store',
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error || 'Connection test unavailable.');
                  const status = result.statuses?.[0];
                  setMessage(status?.message || 'Connection test completed without returning secret values.');
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'Connection test failed.');
                } finally {
                  setTesting(false);
                }
              }}
              className="w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Validate / connection test'}
            </button>
            <button
              type="submit"
              disabled={saving || !selected}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
