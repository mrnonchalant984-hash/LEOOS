import { createPublicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { siteData } from '@/data/site';

export const metadata = createPublicMetadata({
  title: "Website and Software Services",
  description: "Explore LeonardX website concept, software development and code review services, with scope agreed before work begins.",
  path: "/services",
  type: "website",
});

const process = [
  'Share your goal, audience, and any existing materials.',
  'Agree on a clear scope, deliverables, and timeline before work begins.',
  'Review progress and confirm the result against the agreed scope.',
];

export default function ServicesPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
      <section className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[.18em] text-yellow-300">
          <Sparkles size={16} /> LeonardX services
        </p>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
          Practical digital services for your next step.
        </h1>
        <p className="mt-5 text-lg leading-8 text-zinc-300">
          Get help shaping a website idea, building with AI-assisted tools, or improving an existing codebase.
          Every engagement starts with a clear scope and a conversation about what you need.
        </p>
        <Link href="/contact" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">
          Discuss your project <ArrowRight size={17} />
        </Link>
      </section>

      <section aria-labelledby="service-list" className="mt-16">
        <div className="mb-7">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-yellow-300">Ways we can help</p>
          <h2 id="service-list" className="mt-2 text-3xl font-black">Choose the service that fits your goal.</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {siteData.services.map((service, index) => (
            <article key={service.name} className="flex flex-col rounded-3xl border border-white/10 bg-white/[.03] p-6 sm:p-8">
              <p className="text-sm font-semibold text-yellow-300">0{index + 1} / SERVICE</p>
              <h3 className="mt-4 text-2xl font-bold">{service.name}</h3>
              <p className="mt-3 min-h-14 leading-7 text-zinc-300">{service.description}</p>
              <p className="mt-6 text-xl font-bold">{service.price}</p>
              <p className="mt-4 flex-1 border-t border-white/10 pt-4 text-sm leading-6 text-zinc-400">{service.details}</p>
              <Link href={service.href} className="mt-6 inline-flex items-center gap-2 font-semibold text-yellow-300">
                {service.href === '/pricing' ? 'View plans' : service.href === '/app' ? 'Open workspace' : 'Learn more'}
                <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-8 rounded-3xl border border-yellow-500/20 bg-yellow-500/[.04] p-7 sm:p-10 md:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.16em] text-yellow-300">How it works</p>
          <h2 className="mt-3 text-3xl font-black">Clear scope. Useful delivery.</h2>
          <p className="mt-4 leading-7 text-zinc-300">
            We’ll confirm the right service, what’s included, and the next steps before work starts.
          </p>
        </div>
        <ol className="grid gap-4">
          {process.map((step) => (
            <li key={step} className="flex gap-3 text-zinc-200">
              <Check className="mt-1 shrink-0 text-yellow-300" size={18} />
              <span className="leading-7">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 text-center">
        <h2 className="text-3xl font-black">Not sure which service you need?</h2>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-zinc-400">
          Tell us what you’re trying to achieve and we’ll help you choose a sensible starting point.
        </p>
        <Link href="/contact" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 font-semibold hover:border-yellow-300">
          Contact LeonardX <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}
