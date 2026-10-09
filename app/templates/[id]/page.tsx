import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Layers3 } from 'lucide-react';
import { LEO_TEMPLATES } from '@/data/website-templates';
import { LEOAppShell, Panel } from '@/components/LEOAppShell';

export default async function TemplateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = LEO_TEMPLATES.find(item => item.id === id);
  if (!template) notFound();
  return <LEOAppShell title={template.name} subtitle="Template starting point"><Link href="/templates" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white"><ArrowLeft size={14}/> Back to templates</Link><section className="page-hero mt-4"><span className="mini-label"><Layers3 size={12} className="inline mr-2"/>{template.type.replaceAll('_', ' ')}</span><h2>{template.name}</h2><p>{template.description}</p></section><div className="two-grid mt-4"><Panel><div className="panel-title">Included structure</div><div className="template-pages mt-4">{template.pages.join(' · ')}</div><p className="mt-4 text-xs text-zinc-500">This is a starting point. Content, contact details, credentials and proof must be supplied before publishing.</p></Panel><Panel><div className="panel-title">Best suited for</div><div className="team-boundaries mt-4">{template.suitableFor.map(item => <span key={item}>{item}</span>)}</div><Link href={`/setup?template=${encodeURIComponent(template.id)}`} className="primary-button mt-5 inline-flex">Use this starting point <ArrowUpRight size={14}/></Link></Panel></div></LEOAppShell>;
}
