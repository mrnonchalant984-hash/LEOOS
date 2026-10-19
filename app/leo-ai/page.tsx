import { createPublicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowRight, Bot, Code2, Globe, Workflow, ShieldCheck } from 'lucide-react';

export const metadata = createPublicMetadata({
  title: "Meet Leo AI",
  description: "Learn how Leo AI helps organize software ideas, project context and development work inside the LeonardX workspace.",
  path: "/leo-ai",
  type: "website",
});

const features = [
  { icon: Code2, title: 'Build with project context', text: 'Keep your development work connected to project files, requirements and next steps instead of treating every task as a disconnected chat.' },
  { icon: Workflow, title: 'Coordinate specialist workflows', text: 'Organize coding, research, design, testing and delivery tasks with clear checkpoints and review before important changes.' },
  { icon: Globe, title: 'Create websites and web apps', text: 'Use AI-assisted workflows to plan pages, develop product features and prepare projects for deployment through connected services.' },
  { icon: ShieldCheck, title: 'Keep control of delivery', text: 'Review generated work, manage integrations and use the permissions available in your account before taking action.' },
];

export default function LeoAIPage() {
  const faq = [
    ['What is Leo AI?', 'Leo AI is the assistant experience in LeonardX, designed to help organize software work and support website, application and developer workflows.'],
    ['Can Leo AI deploy a website automatically?', 'Deployment depends on project setup, account permissions and configured providers. Review the deployment result from the connected service.'],
    ['Is LeonardX only for developers?', 'No. The platform is intended for developers, creators, freelancers and businesses, with more technical tools available for advanced workflows.'],
  ];
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) };
  return <main className="mx-auto max-w-6xl px-5 py-16 md:py-24">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />
    <section className="mx-auto max-w-4xl text-center"><p className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm text-orange-200"><Bot size={16}/> AI assistant for building software</p><h1 className="text-4xl font-black tracking-tight md:text-6xl">Meet Leo AI. Turn ideas into <span className="text-orange-400">real project work.</span></h1><p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-300">Leo AI helps you shape software ideas into plans, work with project context, coordinate development tasks and move toward a finished website or application inside LeonardX.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/app" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-bold text-black">Open Leo AI <ArrowRight size={17}/></Link><Link href="/pricing" className="rounded-full border border-white/20 px-6 py-3 font-semibold">Explore plans</Link></div></section>
    <section className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-6"><div className="mb-5 inline-flex rounded-xl bg-orange-400/10 p-3 text-orange-300"><Icon size={22}/></div><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-7 text-zinc-400">{text}</p></article>)}</section>
    <section className="mt-20 grid gap-10 md:grid-cols-2"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-orange-300">How it works</p><h2 className="mt-3 text-3xl font-black md:text-4xl">A more connected way to create software.</h2></div><div className="space-y-5 text-zinc-300 leading-7"><p><strong className="text-white">1. Describe the outcome.</strong> Start with a website, application, feature or problem you want to solve.</p><p><strong className="text-white">2. Organize the work.</strong> Turn the request into requirements and practical steps, then review the proposed direction.</p><p><strong className="text-white">3. Build and verify.</strong> Work with project files and available tools, run the checks your setup supports and review results before deployment.</p></div></section>
    <section className="mt-20 rounded-3xl border border-white/10 bg-white/[.035] p-7 md:p-10"><h2 className="text-3xl font-black">Frequently asked questions</h2><div className="mt-6 divide-y divide-white/10">{faq.map(([question, answer]) => <article key={question} className="py-5"><h3 className="text-lg font-bold">{question}</h3><p className="mt-2 leading-7 text-zinc-400">{answer}</p></article>)}</div></section>
    <section className="mt-16 text-center"><h2 className="text-3xl font-black">Start with the idea you want to build.</h2><p className="mx-auto mt-3 max-w-2xl text-zinc-400">Explore the workspace, review the available plans and choose the tools that fit your project.</p><Link href="/app" className="mt-6 inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-bold text-black">Get started with Leo <ArrowRight size={17}/></Link></section>
  </main>;
}
