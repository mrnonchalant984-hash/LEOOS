import Link from 'next/link';
import { ArrowLeft, ArrowRight, ShieldCheck, TerminalSquare } from 'lucide-react';
import { IntegrationStudio } from '@/components/IntegrationStudio';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';

export default function CliGuidePage() {
  return <LEOAppShell title="Braverton CLI" subtitle="Use the supported project API from a local terminal.">
    <div className="mb-5"><Link href="/developers" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={14}/> Back to developer platform</Link></div>
    <div className="page-hero">
      <span className="mini-label">Braverton CLI · legacy npm package @leo-os/cli · v1.0.0</span>
      <h2>Manage supported workspace operations locally.</h2>
      <p>The published CLI validates your API key, links an owned project, and reads or creates projects through existing Braverton API routes. Commands shown in the Studio are examples; it never runs a local process.</p>
      <div className="hero-actions"><Link href="/developers/docs#cli" className="primary-button"><TerminalSquare size={14}/> CLI reference <ArrowRight size={13}/></Link><Link href="/api-keys" className="secondary-button"><ShieldCheck size={13}/> Create an API key</Link></div>
    </div>
    <div className="two-grid">
      <Panel>
        <div className="panel-title">Supported commands</div>
        <div className="code-block mt-4">braverton login --api-key &quot;$BRAVERTON_API_KEY&quot; --base-url https://your-domain<br/>braverton init &lt;workspace-id&gt;<br/>braverton status<br/>braverton projects list<br/>braverton projects create &quot;My app&quot; --type web_app</div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Credentials are stored in the user config directory with restrictive permissions. The legacy package name is retained for compatibility: <code>npm install -g @leo-os/cli</code>. The installed executable is <code>braverton</code>; <code>leo</code> and <code>leonardx</code> remain aliases.</p>
      </Panel>
      <Panel>
        <div className="panel-title">Cloud execution boundary</div>
        <p className="mt-3 text-sm leading-6 text-zinc-300"><code>braverton deploy --brief</code> and <code>braverton ship</code> are not currently connected to a production deployment endpoint. They return an explicit unsupported-workflow message; use the authenticated Braverton workspace deployment flow instead.</p>
        <div className="mt-4 rounded-xl border border-amber-100/15 bg-amber-100/[.04] p-3 text-xs leading-5 text-amber-50/75">The terminal preview below is simulated. It does not access your computer, read your key, or make API requests.</div>
      </Panel>
    </div>
    <IntegrationStudio initialIntegration="cli"/>
  </LEOAppShell>;
}
