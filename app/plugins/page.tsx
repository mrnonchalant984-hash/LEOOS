import Link from 'next/link';
import { ArrowLeft, ArrowRight, Boxes, ExternalLink, ShieldCheck } from 'lucide-react';
import { IntegrationStudio } from '@/components/IntegrationStudio';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { listTrustedPlugins } from '@/lib/plugins';

export const dynamic = 'force-dynamic';

export default function PluginsGuidePage() {
  const plugins = listTrustedPlugins();

  return <LEOAppShell title="Plugin registry" subtitle="Review trusted plugin metadata and its current boundaries.">
    <div className="mb-5"><Link href="/developers" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={14}/> Back to developer platform</Link></div>
    <div className="page-hero">
      <span className="mini-label">Trusted registry · metadata only</span>
      <h2>Review plugin contracts before runtime support.</h2>
      <p>LeonardX currently validates trusted plugin manifests. It does not load or execute external code, persist registrations across server restarts, or provide a plugin marketplace.</p>
      <div className="hero-actions"><Link href="#manifest-reference" className="primary-button"><Boxes size={14}/> Manifest reference <ArrowRight size={13}/></Link><Link href="/api/plugins" className="secondary-button">Registry API <ExternalLink size={13}/></Link></div>
    </div>
    <Panel className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="panel-title">Registered in this server process</div><div className="panel-subtitle">This is the registry returned by the existing metadata endpoint; it is not a persistent marketplace.</div></div><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-zinc-400">{plugins.length} {plugins.length === 1 ? 'entry' : 'entries'}</span></div>
      {plugins.length ? <ul className="mt-4 divide-y divide-white/10">{plugins.map(plugin => <li key={plugin.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div><strong className="text-sm">{plugin.name}</strong><p className="mt-1 text-xs text-zinc-500">{plugin.id} · v{plugin.version} · API {plugin.apiVersion}</p><p className="mt-1 text-xs text-zinc-400">{plugin.description}</p></div><span className="text-[10px] text-zinc-500">Metadata only</span></li>)}</ul> : <div className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-zinc-400">No plugin manifests are registered in this server process.</div>}
    </Panel>
    <div id="manifest-reference" className="mt-3 scroll-mt-24 grid gap-3 lg:grid-cols-2">
      <Panel>
        <div className="flex items-center gap-3"><div className="data-icon"><ShieldCheck size={16}/></div><div><div className="panel-title">Manifest contract</div><div className="panel-subtitle">Source: the existing Zod schema in <code>lib/plugins.ts</code>.</div></div></div>
        <div className="code-block mt-4">id · lowercase letters, digits, hyphens<br/>version · semantic version<br/>apiVersion · 1<br/>permissions · projects:read, projects:write, webhooks:read<br/>entrypoint · HTTPS URL</div>
      </Panel>
      <Panel>
        <div className="panel-title">Security and lifecycle</div>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400"><li>• Registration POST requires the platform owner.</li><li>• GET returns registry metadata; never include credentials in a manifest.</li><li>• The registry is a process-local Map, so it is not durable or shared across serverless instances.</li><li>• External entrypoint code is not downloaded, imported, evaluated, or executed.</li></ul>
      </Panel>
    </div>
    <IntegrationStudio initialIntegration="plugins"/>
  </LEOAppShell>;
}
