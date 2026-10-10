import Link from 'next/link';
import { ArrowRight, Code2, KeyRound, Webhook, Terminal, ShieldCheck } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { IntegrationStudio } from '@/components/IntegrationStudio';

export default function Developers() {
  return <LEOAppShell title="Developer Platform" subtitle="Build on top of LEO OS with scoped APIs, webhooks and SDKs.">
    <div className="page-hero">
      <span className="mini-label">LEO OS API</span>
      <h2>Build your own layer on top of Leo.</h2>
      <p>The developer surface includes authenticated requests, explicit scopes, request IDs, usage tracking and signed webhook tests. Each capability is shown at the level currently supported by the platform.</p>
      <div className="hero-actions">
        <Link href="/docs/api" className="primary-button">Read API docs <ArrowRight size={13}/></Link>
        <Link href="/api-keys" className="secondary-button"><KeyRound size={13}/> Manage API keys</Link>
      </div>
    </div>
    <div className="metric-grid mt-3">
      <div className="metric"><Code2 size={16}/><strong>v1</strong><small>Public API version</small></div>
      <div className="metric"><ShieldCheck size={16}/><strong>Scoped</strong><small>API key access</small></div>
      <div className="metric"><Webhook size={16}/><strong>HMAC</strong><small>Webhook test signing</small></div>
      <div className="metric"><Terminal size={16}/><strong>Local</strong><small>SDK and CLI packages</small></div>
    </div>
    <div className="two-grid">
      <Panel>
        <div className="panel-title">API surface</div>
        <div className="panel-subtitle">Routes currently implemented for API-key access.</div>
        <div className="code-block mt-4"><span className="accent">GET</span> /api/v1/me<br/><span className="accent">GET</span> /api/v1/projects<br/><span className="accent">POST</span> /api/v1/projects<br/><span className="accent">GET</span> /api/v1/projects/:id/status<br/><span className="accent">GET</span> /api/v1/usage<br/><span className="gold-text">Authorization:</span> Bearer leo_live_…<br/><span className="green-text">X-Request-ID:</span> returned for API requests</div>
      </Panel>
      <Panel>
        <div className="panel-title">Developer resources</div>
        <div className="data-list mt-4">
          <Link href="/api-keys" className="data-card"><div className="data-icon"><KeyRound size={15}/></div><main><strong>API keys</strong><small>Scoped credentials, expiry and revocation.</small></main><ArrowRight size={13}/></Link>
          <Link href="/webhooks" className="data-card"><div className="data-icon"><Webhook size={15}/></div><main><strong>Webhooks</strong><small>Real endpoint management; event currently available: webhook.test.</small></main><ArrowRight size={13}/></Link>
          <Link href="/docs/sdk" className="data-card"><div className="data-icon"><Code2 size={15}/></div><main><strong>TypeScript SDK</strong><small>Build the current package locally; npm publication is not verified.</small></main><ArrowRight size={13}/></Link>
          <Link href="/cli" className="data-card"><div className="data-icon"><Terminal size={15}/></div><main><strong>Command-line client</strong><small>Authenticate and manage supported project operations.</small></main><ArrowRight size={13}/></Link>
          <Link href="/ide" className="data-card"><div className="data-icon"><Code2 size={15}/></div><main><strong>Web IDE</strong><small>Review the authenticated project editor and safe preview console.</small></main><ArrowRight size={13}/></Link>
          <Link href="/plugins" className="data-card"><div className="data-icon"><ShieldCheck size={15}/></div><main><strong>Plugin registry</strong><small>Trusted metadata only; external code is not executed.</small></main><ArrowRight size={13}/></Link>
        </div>
      </Panel>
    </div>
    <IntegrationStudio initialIntegration="cli"/>
  </LEOAppShell>;
}
