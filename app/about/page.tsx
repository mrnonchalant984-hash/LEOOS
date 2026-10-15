import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { profileImage, siteData } from '@/data/site';
export const metadata = { title: 'About Leonard Udoh — LeonardX Services' };

const notes = [
  'I am Leonard Udoh, founder of LeonardX. I help businesses and creators turn digital ideas into clear, useful websites and software.',
  'My work combines thoughtful design, responsive development, and practical AI-assisted tools to solve real project needs.',
  'Whether you need a website concept, a guided software build, or a code review, we start by understanding your goals and agreeing on a clear scope.',
];

export default function AboutPage() {
  return (
    <main className="about-page mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <section className="about-hero grid items-center gap-10 lg:grid-cols-[.8fr_1.2fr]">
        <div className="about-portrait mx-auto w-full max-w-md [perspective:1200px]">
          <div className="group relative overflow-hidden rounded-[2rem] border border-yellow-500/30 bg-zinc-950 p-3 shadow-2xl transition-transform duration-700 hover:rotate-y-3 hover:rotate-x-2">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem]">
              <Image src={profileImage} alt="Leonard Udoh" fill priority unoptimized className="object-cover object-top transition duration-700 group-hover:scale-105" />
            </div>
            <div className="absolute inset-x-8 bottom-8 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl">
              <p className="font-bold">{siteData.owner}</p>
              <p className="text-sm text-yellow-300">{siteData.title}</p>
            </div>
          </div>
        </div>
        <div className="about-copy">
          <div className="about-badge mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
            <Sparkles size={16} /> About LeonardX
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Digital services built around what your business needs.</h1>
          <div className="about-notes mt-7 space-y-4 text-lg leading-8 text-zinc-300">
            {notes.map((note) => <p key={note}>{note}</p>)}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/services" className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">
              Explore services <ArrowRight size={17} />
            </Link>
            <Link href="/contact" className="inline-flex items-center rounded-xl border border-white/20 px-5 py-3 font-semibold">
              Discuss a project
            </Link>
          </div>
        </div>
      </section>
      <section className="about-cards mt-20 grid gap-5 md:grid-cols-2">
        <div className="about-card rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
          <h2 className="text-2xl font-black">A service-first approach</h2>
          <p className="mt-3 text-zinc-400">We focus on the outcome you need: a clearer website direction, a working digital product, or practical improvements to your existing code.</p>
        </div>
        <div className="about-card about-card-accent rounded-3xl border border-yellow-500/20 bg-yellow-500/5 p-7">
          <h2 className="text-2xl font-black">Clear scope, honest delivery</h2>
          <p className="mt-3 text-zinc-400">Before work begins, we’ll confirm the deliverables, price, and next steps. No demo concept is presented as completed client work.</p>
          <Link href="/services" className="mt-5 inline-flex items-center text-yellow-300">View services <ArrowRight className="ml-2" size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
