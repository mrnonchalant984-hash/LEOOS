import { LEO_TEMPLATES } from '@/data/website-templates';
import Link from 'next/link';
import { ArrowUpRight, Layers3 } from 'lucide-react';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Templates | LeonardX', description: 'Explore website design starting points for LeonardX projects.' };

export default function Templates() {
  return <LEOAppShell title="Templates" subtitle="A curated set of starting points for your next project.">
    <section className="page-hero">
      <span className="mini-label"><Layers3 size={12} className="inline mr-2"/>PROJECT STARTING POINTS</span>
      <h2>Choose a direction.<br/>Make it your own.</h2>
      <p>Use these existing design foundations to begin a project. Leo can adapt the structure to your requirements, brand, content, and assets rather than treating a template as a finished product.</p>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3 mt-5 mb-3"><p className="text-xs text-zinc-500">{LEO_TEMPLATES.length} available starting points</p><Link href="/setup" className="text-xs text-zinc-200 inline-flex items-center gap-2 hover:text-white">Create from setup <ArrowUpRight size={14}/></Link></div>
    <div className="template-library-grid">{LEO_TEMPLATES.map(template => <Panel key={template.id} className="template-library-item"><div className="flex items-center justify-between gap-3"><span className="mini-label">{template.type.replaceAll('_', ' ')}</span><span className="template-index">{template.id}</span></div><h3>{template.name}</h3><p>{template.description}</p><div className="template-pages">{template.pages.join(' · ')}</div><Link href={`/setup?template=${encodeURIComponent(template.id)}`} className="template-use-link">Use this starting point <ArrowUpRight size={14}/></Link></Panel>)}</div>
  </LEOAppShell>;
}
