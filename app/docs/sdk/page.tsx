import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { IntegrationStudio } from '@/components/IntegrationStudio';

export default function SDK() {
  return <LEOAppShell title="SDK" subtitle="Typed client for supported LeonardX API operations.">
    <div className="page-hero">
      <span className="mini-label">@leo-os/sdk · v2.0.0 · npm package</span>
      <h2>Use the API from typed TypeScript.</h2>
      <p><code>@leo-os/sdk@2.0.0</code> is published on npm and exposes <code>LeoClient</code>, typed API errors, project operations and webhook signature verification. Keep API keys on a server and use the public <code>/api/v1</code> contract.</p>
      <div className="hero-actions"><Link href="/developers/docs#sdk" className="primary-button"><BookOpen size={13}/> Full SDK guide <ArrowRight size={13}/></Link></div>
    </div>
    <Panel className="mt-3">
      <div className="panel-title">Install from npm</div>
      <div className="code-block mt-4">npm install @leo-os/sdk<br/><br/><span className="gold-text">import</span> {'{ LeoClient }'} <span className="gold-text">from</span> <span className="green-text">&apos;@leo-os/sdk&apos;</span>;<br/><br/><span className="gold-text">const</span> leo = <span className="gold-text">new</span> LeoClient({'{'} apiKey: process.env.LEO_API_KEY! {'}'});<br/><span className="gold-text">const</span> projects = <span className="gold-text">await</span> leo.projects.list();</div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">The published package targets the live v1 API. Keep API keys in server-side code.</p>
    </Panel>
    <IntegrationStudio initialIntegration="sdk"/>
  </LEOAppShell>;
}
