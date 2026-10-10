import Link from 'next/link';
import { ArrowLeft, ArrowRight, Boxes, ExternalLink, ShieldCheck } from 'lucide-react';
import { IntegrationStudio } from '@/components/IntegrationStudio';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { PluginRegistryManager } from '@/components/plugins/PluginRegistryManager';
import { listTrustedPlugins } from '@/lib/plugins';

export const dynamic = 'force-dynamic';

export default async function PluginsGuidePage() {
  let plugins: Awaited<ReturnType<typeof listTrustedPlugins>> = [];
  let storageUnavailable = false;
  try { plugins = await listTrustedPlugins(); } catch { storageUnavailable = true; }

  return <LEOAppShell title="Plugin registry" subtitle="Review trusted plugin metadata and its current boundaries.">
    <div className="mb-5"><Link href="/developers" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={14}/> Back to developer platform</Link></div>
    <div className="page-hero">
      <span className="mini-label">Trusted registry · metadata only</span>
      <h2>Review plugin contracts before runtime support.</h2>
      <p>Approved manifests are persisted by plugin ID and version. Registration validates permissions and compatibility; external code is never downloaded or executed.</p>
      <div className="hero-actions"><Link href="#manifest-reference" className="primary-button"><Boxes size={14}/> Manifest reference <ArrowRight size={13}/></Link><Link href="/api/plugins" className="secondary-button">Registry API <ExternalLink size={13}/></Link></div>
    </div>
    <Panel className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="panel-title">Enabled manifests</div><div className="panel-subtitle">Only enabled metadata is public. Plugin execution is not available.</div></div><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-zinc-400">{plugins.length} {plugins.length === 1 ? 'entry' : 'entries'}</span></div>
      {storageUnavailable ? <div role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-5 text-sm text-amber-100">Registry storage is unavailable. The additive database migration must be applied before registration is durable.</div> : plugins.length ? <ul className="mt-4 divide-y divide-white/10">{plugins.map(plugin => { const manifest = plugin.manifest as { name?: string; description?: string }; return <li key={`${plugin.plugin_id}@${plugin.version}`} className="flex flex-wrap items-start justify-between gap-3 py-3"><div><strong className="text-sm">{manifest.name || plugin.plugin_id}</strong><p className="mt-1 text-xs text-zinc-500">{plugin.plugin_id} · v{plugin.version} · API {plugin.api_version}</p><p className="mt-1 text-xs text-zinc-400">{manifest.description}</p></div><span className="text-[10px] text-emerald-200">Enabled · metadata only</span></li>; })}</ul> : <div className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-zinc-400">No enabled plugin manifests are registered.</div>}
    </Panel>
    <div id="manifest-reference" className="mt-3 scroll-mt-24 grid gap-3 lg:grid-cols-2">
      <Panel>
        <div className="flex items-center gap-3"><div className="data-icon"><ShieldCheck size={16}/></div><div><div className="panel-title">Manifest contract</div><div className="panel-subtitle">Validated before metadata is stored.</div></div></div>
        <div className="code-block mt-4">id · lowercase letters, digits, hyphens<br/>version · semantic version (major.minor.patch)<br/>apiVersion · 1<br/>permissions · projects:read, projects:write, webhooks:read<br/>entrypoint · public HTTPS URL</div>
      </Panel>
      <Panel>
        <div className="panel-title">Security and lifecycle</div>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400"><li>Registration and lifecycle changes require platform-owner 2FA.</li><li>Register an updated manifest as a new version; an existing version cannot be overwritten.</li><li>Lifecycle states are registered, enabled, disabled, and deprecated.</li><li>Metadata permissions do not grant runtime execution; external code remains disabled.</li></ul>
      </Panel>
    </div>
    <PluginRegistryManager />
    <IntegrationStudio initialIntegration="plugins"/>
  </LEOAppShell>;
}
