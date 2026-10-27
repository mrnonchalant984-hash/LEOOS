'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Rocket } from 'lucide-react';

type CloudBuild = { id: string; provider: 'expo-eas'; status: string; profile: string; error?: string | null; created_at: string; artifact_url?: string | null; artifact_available?: boolean };

export default function CloudBuildPanel({ projectId, projectType }: { projectId: string; projectType: string | null }) {
  const [builds, setBuilds] = useState<CloudBuild[]>([]);
  const [configured, setConfigured] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [profile, setProfile] = useState<'preview' | 'production'>('preview');
  const [pending, setPending] = useState(false);
  const [retryKey, setRetryKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [historyResponse, capabilityResponse] = await Promise.all([
      fetch(`/api/setup/projects?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
      fetch('/api/builds/capabilities', { cache: 'no-store' }),
    ]);
    const history = await historyResponse.json().catch(() => null);
    const capability = await capabilityResponse.json().catch(() => null);
    if (!historyResponse.ok) throw new Error(history?.error || 'Build history could not be loaded.');
    const savedBuilds: CloudBuild[] = (Array.isArray(history?.builds) ? history.builds : []).filter((build: CloudBuild) => build.provider === 'expo-eas');
    const currentBuilds = await Promise.all(savedBuilds.map(async build => {
      if (!['queued', 'building'].includes(build.status)) return build;
      try {
        const response = await fetch(`/api/builds/expo/${encodeURIComponent(build.id)}`, { cache: 'no-store' });
        const status = await response.json().catch(() => null);
        return response.ok ? { ...build, ...status } as CloudBuild : build;
      } catch { return build; }
    }));
    setBuilds(currentBuilds);
    setConfigured(capability?.mobileApp?.configured === true);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const load = async () => { try { await refresh(); if (active) setError(''); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Build history could not be loaded.'); } };
    void load(); const timer = window.setInterval(() => { if (active) void load(); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  async function startBuild() {
    if (pending) return;
    setPending(true); setError(''); setNotice('Submitting the mobile build request…');
    const idempotencyKey = retryKey || crypto.randomUUID(); setRetryKey(idempotencyKey);
    try {
      const verify = await fetch(`/api/builds/expo?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      const link = await verify.json().catch(() => null);
      if (!verify.ok) throw new Error(link?.error || 'Expo project access could not be verified.');
      if (link?.will_provision) setNotice('Provisioning the Expo project and dependency lockfile…');
      const response = await fetch('/api/builds/expo', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project_id:projectId, platform, profile, idempotency_key:idempotencyKey }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Build could not be submitted.');
      setNotice(`Build ${result.job_id} is ${result.status}.`); setRetryKey(''); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Build submission could not be confirmed.'); setNotice('If the request timed out, check build history before submitting another request.'); try { await refresh(); } catch {} }
    finally { setPending(false); }
  }

  if (projectType !== 'mobile_app') return null;
  const activeBuild = builds.some(build => ['queued','building'].includes(build.status));
  return <section aria-label="Mobile cloud builds" className="mx-auto mb-4 max-w-[1600px] rounded-xl border border-white/10 bg-[#101114] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Expo mobile builds</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">Native mobile builds are separate from browser games and use your existing monthly build allowance. Provider fees and signing requirements are separate.</p></div><button type="button" onClick={() => void refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Refresh failed.'))} className="inline-flex items-center gap-2 rounded border border-white/10 px-3 py-2 text-xs text-white/70"><RefreshCw size={13}/>Refresh</button></div>
    <div className="mt-4 flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs text-white/55">Platform<select value={platform} onChange={event => setPlatform(event.target.value as 'android'|'ios')} className="rounded border border-white/10 bg-[#090a0c] px-3 py-2 text-white"><option value="android">Android</option><option value="ios">iOS</option></select></label><label className="grid gap-1 text-xs text-white/55">Profile<select value={profile} onChange={event => setProfile(event.target.value as 'preview'|'production')} className="rounded border border-white/10 bg-[#090a0c] px-3 py-2 text-white"><option value="preview">Preview</option><option value="production">Production</option></select></label><button type="button" disabled={pending||activeBuild||!configured} onClick={() => void startBuild()} className="inline-flex items-center gap-2 rounded bg-[#d7aa70] px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"><Rocket size={15}/>{pending?'Submitting…':'Start mobile build'}</button>{!configured&&<span className="text-xs text-amber-200">Expo setup is required before a build can start.</span>}</div>
    {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}{notice&&<p aria-live="polite" className="mt-3 text-xs text-white/55">{notice}</p>}
    <div className="mt-4 space-y-2">{builds.length===0?<p className="text-xs text-white/40">No mobile cloud builds recorded for this project.</p>:builds.map(build=><article key={build.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[.07] px-3 py-2.5 text-xs"><span className="font-medium text-white">Expo · {build.profile}</span><span className="rounded-full border border-white/10 px-2 py-1 text-white/65">{build.status}</span><time className="text-white/35">{new Date(build.created_at).toLocaleString()}</time>{['building','queued'].includes(build.status)&&<LoaderCircle size={13} className="animate-spin text-[#d7aa70]" aria-label="Build in progress"/>}{build.error&&<span className="basis-full text-red-300">{build.error}</span>}{build.status==='completed'&&build.artifact_available!==false&&<a href={build.artifact_url||`/api/builds/expo/${encodeURIComponent(build.id)}/artifact`} className="ml-auto inline-flex items-center gap-1 text-[#d7aa70]"><Download size={13}/>Download artifact</a>}</article>)}</div>
  </section>;
}
