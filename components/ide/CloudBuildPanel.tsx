'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Rocket } from 'lucide-react';

type CloudBuild = {
  id: string;
  provider: 'expo-eas' | 'godot-build-service';
  status: string;
  profile: string;
  error?: string | null;
  created_at: string;
  artifact_url?: string | null;
  artifact_available?: boolean;
};

type ProviderState = {
  mobileApp?: { configured: boolean };
  game?: { configured: boolean; presets?: string[] };
};

type GodotAsset = { asset_id: string; path: string; mime_type: string; size_bytes: number; sha256: string };

export default function CloudBuildPanel({ projectId, projectType }: { projectId: string; projectType: string | null }) {
  const [builds, setBuilds] = useState<CloudBuild[]>([]);
  const [providers, setProviders] = useState<ProviderState>({});
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [profile, setProfile] = useState<'preview' | 'production'>('preview');
  const [preset, setPreset] = useState('');
  const [pending, setPending] = useState(false);
  const [retryKey, setRetryKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [assets, setAssets] = useState<GodotAsset[]>([]);
  const [assetPath, setAssetPath] = useState('assets/texture.png');
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const assetInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [historyResponse, capabilityResponse, assetResponse] = await Promise.all([
      fetch(`/api/setup/projects?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
      fetch('/api/builds/capabilities', { cache: 'no-store' }),
      projectType === 'game'
        ? fetch(`/api/builds/godot/assets?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
        : Promise.resolve(null),
    ]);
    const history = await historyResponse.json().catch(() => null);
    const capability = await capabilityResponse.json().catch(() => null);
    const assetResult = assetResponse ? await assetResponse.json().catch(() => null) : null;
    if (!historyResponse.ok) throw new Error(history?.error || 'Build history could not be loaded.');
    if (assetResponse && !assetResponse.ok) throw new Error(assetResult?.error || 'Game assets could not be loaded.');
    const savedBuilds: CloudBuild[] = Array.isArray(history?.builds) ? history.builds : [];
    const currentBuilds = await Promise.all(savedBuilds.map(async build => {
      if (!['queued', 'building'].includes(build.status)) return build;
      const provider = build.provider === 'expo-eas' ? 'expo' : 'godot';
      try {
        const response = await fetch(`/api/builds/${provider}/${encodeURIComponent(build.id)}`, { cache: 'no-store' });
        const status = await response.json().catch(() => null);
        return response.ok ? { ...build, ...status } as CloudBuild : build;
      } catch { return build; }
    }));
    setBuilds(currentBuilds);
    setProviders(capability || {});
    setAssets(Array.isArray(assetResult?.assets) ? assetResult.assets : []);
    const presets = Array.isArray(capability?.game?.presets) ? capability.game.presets : [];
    setPreset(previous => previous && presets.includes(previous) ? previous : presets[0] || '');
  }, [projectId, projectType]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refresh();
        if (active) setError('');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Build history could not be loaded.');
      }
    };
    void load();
    const timer = window.setInterval(() => { if (active) void load(); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  const activeBuild = builds.some(build => ['queued', 'building'].includes(build.status));

  async function startBuild() {
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('Submitting the build request…');
    const provider = projectType === 'mobile_app' ? 'expo-eas' : 'godot-build-service';
    const idempotencyKey = retryKey || crypto.randomUUID();
    setRetryKey(idempotencyKey);
    const body = provider === 'expo-eas'
      ? { project_id: projectId, platform, profile, idempotency_key: idempotencyKey }
      : { project_id: projectId, preset, idempotency_key: idempotencyKey };
    try {
      if (provider === 'expo-eas') {
        const verify = await fetch(`/api/builds/expo?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const link = await verify.json().catch(() => null);
        if (!verify.ok) throw new Error(link?.error || 'Expo project access could not be verified.');
      }
      const response = await fetch(`/api/builds/${provider === 'expo-eas' ? 'expo' : 'godot'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Build could not be submitted.');
      setNotice(`Build ${result.job_id} is ${result.status}.`);
      setRetryKey('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Build submission could not be confirmed.');
      setNotice('If the request timed out, check build history before submitting another request.');
      try { await refresh(); } catch { /* Keep the original submission error visible. */ }
    } finally {
      setPending(false);
    }
  }

  async function cancelBuild(build: CloudBuild) {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/builds/godot/${encodeURIComponent(build.id)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Queued build could not be cancelled.');
      setNotice(`Build ${build.id} was cancelled while queued.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Queued build could not be cancelled.');
    } finally {
      setPending(false);
    }
  }

  async function attachAsset() {
    if (pending || !assetFile) return;
    setPending(true);
    setError('');
    setNotice('Validating and saving the private game image…');
    const form = new FormData();
    form.set('project_id', projectId);
    form.set('path', assetPath.trim());
    form.set('file', assetFile);
    try {
      const response = await fetch('/api/builds/godot/assets', { method: 'POST', body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Game asset could not be saved.');
      setNotice(`Saved ${result.asset.path} (${Math.ceil(result.asset.size_bytes / 1024)} KB).`);
      setAssetFile(null);
      if (assetInput.current) assetInput.current.value = '';
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Game asset could not be saved.');
    } finally {
      setPending(false);
    }
  }

  async function detachAsset(asset: GodotAsset) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/builds/godot/assets', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, path: asset.path }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Game asset could not be removed.');
      setNotice(`Removed ${asset.path} from this game project.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Game asset could not be removed.');
    } finally {
      setPending(false);
    }
  }

  if (projectType !== 'mobile_app' && projectType !== 'game') return null;
  const isMobile = projectType === 'mobile_app';
  const providerReady = isMobile ? providers.mobileApp?.configured : providers.game?.configured;
  const presets = providers.game?.presets || [];

  return <section aria-label="Cloud builds" className="mx-auto mb-4 max-w-[1600px] rounded-xl border border-white/10 bg-[#101114] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">{isMobile ? 'Expo mobile builds' : 'Godot game builds'}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">Builds use your account’s existing monthly build allowance. Provider fees and signing requirements are separate.</p></div>
      <button type="button" onClick={() => void refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Refresh failed.'))} className="inline-flex items-center gap-2 rounded border border-white/10 px-3 py-2 text-xs text-white/70"><RefreshCw size={13}/>Refresh</button>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-2">
      {isMobile ? <>
        <label className="grid gap-1 text-xs text-white/55">Platform<select value={platform} onChange={event => setPlatform(event.target.value as 'android' | 'ios')} className="rounded border border-white/10 bg-[#090a0c] px-3 py-2 text-white"><option value="android">Android</option><option value="ios">iOS</option></select></label>
        <label className="grid gap-1 text-xs text-white/55">Profile<select value={profile} onChange={event => setProfile(event.target.value as 'preview' | 'production')} className="rounded border border-white/10 bg-[#090a0c] px-3 py-2 text-white"><option value="preview">Preview</option><option value="production">Production</option></select></label>
      </> : <label className="grid gap-1 text-xs text-white/55">Verified export preset<select value={preset} onChange={event => setPreset(event.target.value)} disabled={!presets.length} className="min-w-52 rounded border border-white/10 bg-[#090a0c] px-3 py-2 text-white"><option value="">Choose preset</option>{presets.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      <button type="button" disabled={pending || activeBuild || !providerReady || (!isMobile && !preset)} onClick={() => void startBuild()} className="inline-flex items-center gap-2 rounded bg-[#d7aa70] px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"><Rocket size={15}/>{pending ? 'Submitting…' : 'Start build'}</button>
      {!providerReady && <span className="text-xs text-amber-200">Provider setup is required before a build can start.</span>}
    </div>
    {!isMobile && <div className="mt-4 rounded-lg border border-white/[.08] bg-black/15 p-3">
      <h3 className="text-sm font-medium">Game images</h3>
      <p className="mt-1 text-xs text-white/45">Add private PNG, JPEG, or WebP textures. Up to 20 files and 2 MB total. The build verifies each file and includes a SHA-256 manifest.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-white/55">Project path<input value={assetPath} onChange={event => setAssetPath(event.target.value)} maxLength={240} className="w-64 rounded border border-white/10 bg-[#090a0c] px-3 py-2 text-white" /></label>
        <label className="grid gap-1 text-xs text-white/55">Image file<input ref={assetInput} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0] || null; setAssetFile(file); if (file) { const safeName = file.name.replace(/[^A-Za-z0-9_. -]/g, '_').slice(0, 80); setAssetPath(`assets/${safeName}`); } }} className="max-w-64 text-xs text-white/65 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-2 file:text-white" /></label>
        <button type="button" disabled={pending || !assetFile} onClick={() => void attachAsset()} className="rounded border border-white/10 px-3 py-2 text-xs text-white disabled:opacity-40">Add image</button>
      </div>
      {assets.length > 0 && <ul className="mt-3 space-y-1.5">{assets.map(asset => <li key={asset.asset_id} className="flex flex-wrap items-center gap-2 text-xs text-white/65"><code>{asset.path}</code><span>{Math.ceil(asset.size_bytes / 1024)} KB · {asset.mime_type}</span><button type="button" disabled={pending} onClick={() => void detachAsset(asset)} className="text-red-200 disabled:opacity-40">Remove</button></li>)}</ul>}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {notice && <p aria-live="polite" className="mt-3 text-xs text-white/55">{notice}</p>}
    <div className="mt-4 space-y-2">
      {builds.length === 0 ? <p className="text-xs text-white/40">No cloud builds recorded for this project.</p> : builds.map(build => {
        const pollPath = build.provider === 'expo-eas' ? 'expo' : 'godot';
        const artifactPath = `/api/builds/${pollPath}/${encodeURIComponent(build.id)}/artifact`;
        return <article key={build.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[.07] px-3 py-2.5 text-xs">
          <span className="font-medium text-white">{build.provider === 'expo-eas' ? 'Expo' : 'Godot'} · {build.profile}</span>
          <span className="rounded-full border border-white/10 px-2 py-1 text-white/65">{build.status}</span>
          <time className="text-white/35">{new Date(build.created_at).toLocaleString()}</time>
          {build.status === 'building' || build.status === 'queued' ? <LoaderCircle size={13} className="animate-spin text-[#d7aa70]" aria-label="Build in progress"/> : null}
          {build.error && <span className="basis-full text-red-300">{build.error}</span>}
          {build.status === 'completed' && build.artifact_available !== false && <a href={build.artifact_url || artifactPath} className="ml-auto inline-flex items-center gap-1 text-[#d7aa70]"><Download size={13}/>Download artifact</a>}
          {build.provider === 'godot-build-service' && build.status === 'queued' && <button type="button" disabled={pending} onClick={() => void cancelBuild(build)} className="ml-auto text-red-200 disabled:opacity-50">Cancel queued build</button>}
        </article>;
      })}
    </div>
  </section>;
}
