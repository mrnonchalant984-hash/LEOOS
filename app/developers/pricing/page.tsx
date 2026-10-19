import { createPublicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowRight, Code2, KeyRound } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import { ApiPlanChooser } from './ApiPlanChooser';

export const metadata = createPublicMetadata({
  title: "Developer API Pricing",
  description: "Review Developer API plan options, usage limits and billing terms for the LeonardX developer platform.",
  path: "/developers/pricing",
  type: "website",
});

export default function DeveloperPricingPage() {
  return <LEOAppShell title="Developer API pricing" subtitle="Choose the API capacity that fits your application.">
    <section className="page-hero">
      <span className="mini-label">LEONARDX DEVELOPER PLATFORM</span>
      <h2>One API key. Access when your plan is active.</h2>
      <p>Create and keep your API key for free. Choose a plan to activate API execution and receive included usage credits. Your key does not need to be recreated after payment.</p>
      <div className="hero-actions">
        <Link href="/api-keys" className="secondary-button"><KeyRound size={14}/> Manage API keys</Link>
        <Link href="/docs/api" className="secondary-button"><Code2 size={14}/> API documentation <ArrowRight size={13}/></Link>
      </div>
    </section>
    <Panel className="mt-4"><ApiPlanChooser /></Panel>
  </LEOAppShell>;
}
