import { createPublicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { IntegrationStudio } from '@/components/IntegrationStudio';

export const metadata = createPublicMetadata({
  title: 'TypeScript SDK',
  description: "Install and use the Braverton TypeScript SDK to authenticate and work with supported API projects and usage.",
  path: "/docs/sdk",
  type: "website",
});
export default function SDK() {
  return <LEOAppShell title="SDK" subtitle="Typed client for supported Braverton API operations.">
    <div className="page-hero">
      <span className="mini-label">@braverton/sdk · v2.0.0 · repository package source</span>
      <h2>Use the API from typed TypeScript.</h2>
      <p><code>@braverton/sdk@2.0.0</code> is available in the repository source and exposes <code>BravertonClient</code>, typed API errors, project operations and webhook signature verification. Keep API keys on a server and use the public <code>/api/v1</code> contract.</p>
      <div className="hero-actions"><Link href="/developers/docs#sdk" className="primary-button"><BookOpen size={13}/> Full SDK guide <ArrowRight size={13}/></Link></div>
    </div>
    <Panel className="mt-3">
      <div className="panel-title">Install when the npm package is published</div>
      <div className="code-block mt-4"><span className="text-zinc-500">After npm publication:</span><br/>npm install @braverton/sdk<br/><br/><span className="gold-text">import</span> {'{ BravertonClient }'} <span className="gold-text">from</span> <span className="green-text">&apos;@braverton/sdk&apos;</span>;<br/><br/><span className="gold-text">const</span> braverton = <span className="gold-text">new</span> BravertonClient({'{'} apiKey: process.env.BRAVERTON_API_KEY! {'}'});<br/><span className="gold-text">const</span> projects = <span className="gold-text">await</span> braverton.projects.list();</div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">The SDK is currently available as repository source; npm publication is a separate release step. Keep API keys in server-side code.</p>
    </Panel>
    <IntegrationStudio initialIntegration="sdk"/>
  </LEOAppShell>;
}
