import Link from 'next/link';
import { ArrowLeft, ArrowRight, Code2, ShieldCheck, TerminalSquare } from 'lucide-react';
import { IntegrationStudio } from '@/components/IntegrationStudio';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';

export default function IdeGuidePage() {
  return <LEOAppShell title="LeonardX Web IDE" subtitle="Edit files in an owned project workspace.">
    <div className="mb-5"><Link href="/developers" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={14}/> Back to developer platform</Link></div>
    <div className="page-hero">
      <span className="mini-label">Workspace editor · authenticated</span>
      <h2>Edit project files in a protected workspace.</h2>
      <p>The Web IDE loads files from the selected project after server-side ownership checks. It supports file creation, editing, and saving; its console is a safe preview, not a shell or deployment runner.</p>
      <div className="hero-actions"><Link href="/dashboard" className="primary-button"><Code2 size={14}/> Choose a workspace <ArrowRight size={13}/></Link><Link href="/templates" className="secondary-button">Browse templates</Link></div>
    </div>
    <div className="two-grid">
      <Panel>
        <div className="flex items-center gap-3"><div className="data-icon"><Code2 size={16}/></div><div><div className="panel-title">Project file editor</div><div className="panel-subtitle">Changes save to the authenticated project record.</div></div></div>
        <p className="mt-4 text-xs leading-6 text-zinc-400">The file API validates relative paths and caps workspaces at 250 files, 256 KB per file, and 2 MB total. It does not expose files to another user’s account.</p>
      </Panel>
      <Panel>
        <div className="flex items-center gap-3"><div className="data-icon"><TerminalSquare size={16}/></div><div><div className="panel-title">Preview console</div><div className="panel-subtitle">No shell, generated-code execution, or deployment.</div></div></div>
        <p className="mt-4 text-xs leading-6 text-zinc-400">Supported commands are <code>help</code>, <code>ls</code>, <code>cat &lt;path&gt;</code>, and <code>clear</code>. Other input is rejected by the preview console.</p>
      </Panel>
    </div>
    <div id="workspace-reference" className="mt-8 scroll-mt-24 rounded-2xl border border-white/10 bg-[#090a0c] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200"><ShieldCheck size={14} className="text-amber-100"/> Open a real workspace</div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">From your signed-in dashboard, open a project and choose <strong className="text-zinc-200">Open IDE</strong>. The route requires that project’s real ID and session; the preview below uses no customer workspace.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500"><code>/ide/[workspaceId]</code><span>·</span><code>GET/PATCH /api/workspaces/[id]/files</code></div>
    </div>
    <IntegrationStudio initialIntegration="ide"/>
  </LEOAppShell>;
}
