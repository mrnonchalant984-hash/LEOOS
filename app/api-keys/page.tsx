'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Copy, KeyRound, Plus, ShieldAlert } from 'lucide-react';
import { LEOAppShell, Panel, StatusPill } from '@/components/LEOAppShell';

type KeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  revoked: boolean;
  created_at: string;
  expires_at: string | null;
};

const SCOPE_OPTIONS = [
  ['read', 'Read account and supported resources'],
  ['write', 'Write supported resources'],
  ['projects:read', 'Read projects'],
  ['projects:write', 'Create and update projects'],
] as const;

export default function Keys() {
  const router = useRouter();
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [expiryDays, setExpiryDays] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [keyCreated, setKeyCreated] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/developers/api-keys');
    const data = response.ok ? await response.json() : { keys: [] };
    setKeys(data.keys || []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  async function create() {
    if (!name.trim() || !scopes.length || saving) return;
    setSaving(true);
    setError('');
    setSecret('');
    setCopied(false);
    setKeyCreated(false);
    try {
      const response = await fetch('/api/developers/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes, expires_at: expiryDays ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString() : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'The API key could not be created.');
        return;
      }
      setSecret(data.secret || '');
      setKeyCreated(true);
      setName('');
      setExpiryDays('');
      await load();
    } catch {
      setError('Network error. Try creating the key again.');
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/developers/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.ok) await load();
    else setError((await response.json().catch(() => ({}))).error || 'The key could not be revoked.');
  }

  async function rotate(key: KeyRecord) {
    setError('');
    const response = await fetch('/api/developers/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotate_id: key.id, name: key.name, scopes: key.scopes, expires_at: key.expires_at }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || 'The key could not be rotated.'); return; }
    setSecret(data.secret || '');
    setCopied(false);
    await load();
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  async function copyAndContinue() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => router.push('/developers/pricing'), 350);
    } catch {
      setError('Copy was blocked by your browser. Copy the key manually before continuing to pricing.');
    }
  }

  return (
    <LEOAppShell title="API Keys" subtitle="Scoped credentials for authorized API access.">
      <div className="page-hero">
        <span className="mini-label">Developer security</span>
        <h2>Keys are scoped, revocable and never shown twice.</h2>
        <p>Create a least-privilege key for each integration. The full secret is returned only at creation time.</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Key name" aria-label="Key name" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-amber-200/50" />
            <input value={expiryDays} onChange={(event) => setExpiryDays(event.target.value.replace(/[^0-9]/g, '').slice(0, 5))} inputMode="numeric" min="1" placeholder="Never expires (days)" aria-label="Key expiry in days" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-amber-200/50" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPE_OPTIONS.map(([scope, description]) => (
              <label key={scope} className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} className="mt-0.5 accent-amber-300" />
                <span><strong className="block text-zinc-200">{scope}</strong><small className="text-zinc-500">{description}</small></span>
              </label>
            ))}
          </div>
        </div>
        <div className="hero-actions">
          <button className="primary-button disabled:cursor-not-allowed disabled:opacity-50" onClick={create} disabled={!name.trim() || !scopes.length || saving}>
            <Plus size={13} /> {saving ? 'Creating…' : 'Create key'}
          </button>
        </div>
        {error && <div role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-xs text-red-100">{error}</div>}
        {secret && <div role="status" className="mt-3 space-y-3 rounded-xl border border-amber-200/20 bg-amber-200/[.04] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><span className="break-all text-xs"><span className="gold-text">Copy your key now:</span> {secret}</span><button type="button" onClick={() => void copySecret()} className="secondary-button">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy secret'}</button></div><p className="text-xs leading-5 text-zinc-400">Your key is saved, but billable API requests stay locked until you activate a paid API plan. You will keep this same key after payment.</p>{keyCreated && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void copyAndContinue()} className="primary-button">Copy key & continue to pricing <ArrowRight size={13}/></button><span className="text-[10px] text-zinc-500">Copy the secret before leaving; it cannot be shown again.</span></div>}</div>}
      </div>
      <Panel className="mt-3">
        <div className="panel-title">Your keys</div>
        <div className="data-list mt-4">
          {keys.length ? keys.map((key) => <div className="data-card" key={key.id}><div className="data-icon"><KeyRound size={15} /></div><main><strong>{key.name}</strong><small>{key.prefix}… · {key.scopes.join(', ')} · {key.expires_at ? `expires ${new Date(key.expires_at).toLocaleDateString()}` : 'never expires'}</small></main><div className="flex items-center gap-2"><StatusPill status={key.revoked ? 'REVOKED' : 'ACTIVE'} />{!key.revoked && <><button type="button" className="text-[10px] text-amber-200 hover:text-white" onClick={() => void rotate(key)}>Rotate</button><button type="button" className="text-[10px] text-red-200 hover:text-white" onClick={() => void revoke(key.id)}>Revoke</button></>}</div></div>) : <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[10px] text-zinc-600"><ShieldAlert size={17} className="mx-auto mb-2" />No API keys created.</div>}
        </div>
      </Panel>
    </LEOAppShell>
  );
}
