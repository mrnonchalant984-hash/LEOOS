import Link from 'next/link';
import { ArrowLeft, ArrowRight, ShieldCheck, TerminalSquare } from 'lucide-react';
import { IntegrationStudio } from '@/components/IntegrationStudio';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';

export default function CliGuidePage() {
  return <LEOAppShell title="LeonardX CLI" subtitle="Use the supported project API from a local terminal.">
    <div className="mb-5"><Link href="/developers" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={14}/> Back to developer platform</Link></div>
    <div className="page-hero">
      <span className="mini-label">@leo-os/cli · source package</span>
      <h2>Manage supported workspace operations locally.</h2>
      <p>The CLI validates your API key, links an owned project, and reads or creates projects through existing LeonardX API routes. Commands shown in the Studio are examples; it never runs a local process.</p>
      <div className="hero-actions"><Link href="/developers/docs#cli" className="primary-button"><TerminalSquare size={14}/> CLI reference <ArrowRight size={13}/></Link><Link href="/api-keys" className="secondary-button"><ShieldCheck size={13}/> Create an API key</Link></div>
    </div>
    <div className="two-grid">
      <Panel>
        <div className="panel-title">Supported commands</div>
        <div className="code-block mt-4">leo login --api-key &quot;$LEO_API_KEY&quot; --base-url https://your-domain<br/>leo init &lt;workspace-id&gt;<br/>leo status<br/>leo projects list<br/>leo projects create &quot;My app&quot; --type web_app</div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Credentials are stored in the user config directory with restrictive permissions. The package can be run from source; npm publication is not verified.</p>
      </Panel>
      <Panel>
        <div className="panel-title">Cloud execution boundary</div>
        <p className="mt-3 text-sm leading-6 text-zinc-300"><code>leo deploy --brief</code> and <code>leo ship</code> currently stop without submitting a task or triggering a deployment. API-key cloud dispatch is not implemented.</p>
        <div className="mt-4 rounded-xl border border-amber-100/15 bg-amber-100/[.04] p-3 text-xs leading-5 text-amber-50/75">The terminal preview below is simulated. It does not access your computer, read your key, or make API requests.</div>
      </Panel>
    </div>
    <IntegrationStudio initialIntegration="cli"/>
  </LEOAppShell>;
}
