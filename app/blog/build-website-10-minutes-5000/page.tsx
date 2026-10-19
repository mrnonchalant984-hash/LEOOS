import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { SITE_ORIGIN, SOCIAL_IMAGE_PATH } from '@/lib/seo'; export default function Post(){return <main className='mx-auto max-w-4xl px-4 py-16'><JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': SITE_ORIGIN + '/blog/build-website-10-minutes-5000' + '#article',
      headline: 'How to Build a Professional Website in 10 Minutes on a Lean Budget',
      description: 'A brief guide to planning a professional website on a lean budget, from choosing essential pages to reviewing AI-assisted work.',
      url: SITE_ORIGIN + '/blog/build-website-10-minutes-5000',
      mainEntityOfPage: { '@type': 'WebPage', '@id': SITE_ORIGIN + '/blog/build-website-10-minutes-5000' },
      image: [SITE_ORIGIN + SOCIAL_IMAGE_PATH],
      author: { '@type': 'Person', name: 'Leonard Udoh', url: SITE_ORIGIN + '/about' },
      publisher: { '@id': SITE_ORIGIN + '/#organization' },
      inLanguage: 'en',
    }} /><article className='rounded-3xl border border-white/10 bg-white/[.04] p-8 md:p-12'><p className='text-orange-400'>Leonard · Oct 2026</p><h1 className='mt-3 text-4xl font-black'>How to Build a Professional Website in 10 Minutes on a Lean Budget</h1><p className='mt-6 text-lg leading-8 text-zinc-300'>Leo OS is designed for creators, freelancers and businesses worldwide who want practical AI tools for websites, code, content and creative workflows. This article explains practical ways to use AI while keeping costs and workflow clear.</p><h2 className='mt-10 text-2xl font-bold'>Start with a real workflow</h2><p className='mt-3 leading-8 text-zinc-300'>Sign up, choose the feature you need, verify any required payment, then use Leo and keep the generated work inside your account.</p><Link className='mt-8 inline-block rounded-full bg-orange-500 px-6 py-3 font-bold' href='/pricing'>View Pricing</Link></article></main>}