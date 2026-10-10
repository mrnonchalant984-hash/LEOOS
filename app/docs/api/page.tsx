import Link from 'next/link';
import { ArrowRight, KeyRound } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { IntegrationStudio } from '@/components/IntegrationStudio';

export default function API() {
  return <LEOAppShell title="API v1 and v2" subtitle="Authenticated programmatic access to LEO OS resources.">
    <div className="page-hero">
      <span className="mini-label">Developer reference</span>
      <h2>Use the API with clear access boundaries.</h2>
      <p>Project routes use scoped API keys, request IDs and structured errors. The walkthrough below is a safe preview; it does not send requests or collect credentials.</p>
      <div className="hero-actions"><Link href="/api-keys" className="primary-button"><KeyRound size={13}/> Manage API keys <ArrowRight size={13}/></Link></div>
    </div>
    <Panel className="mt-3">
      <div className="panel-title">Available API-key routes</div>
      <div className="code-block mt-4"><span className="accent">GET</span> /api/v1/projects<br/><span className="accent">GET</span> /api/v2/me<br/><span className="accent">GET</span> /api/v2/projects<br/><span className="accent">POST</span> /api/v2/projects <span className="text-zinc-500">(write scope)</span><br/><span className="accent">GET</span> /api/v2/projects/:id/status<br/><br/><span className="gold-text">Authorization:</span> Bearer &lt;leo_live_api_key&gt;<br/><span className="gold-text">X-Request-ID:</span> optional client request ID</div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">An authenticated, allowlisted proxy handler exists at <code>/api/docs/playground</code>. The Studio below does not call that handler; keep API keys server-side and use the documented API from your own trusted environment.</p>
    </Panel>
    <IntegrationStudio initialIntegration="api"/>
  </LEOAppShell>;
}
