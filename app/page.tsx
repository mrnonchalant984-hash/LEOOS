import type { Metadata } from 'next';
import { PromptFirstLanding } from '@/components/PromptFirstLanding';
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TITLE } from '@/lib/seo';

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, url: SITE_ORIGIN + '/' },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION },
};

const FAQ_SECTION_TITLE = 'COMMON QUESTIONS';
const faqs = [
  ['What can I build with LeonardX?', 'You can start websites, web applications and SaaS projects from a written brief, then continue working in your project workspace.'],
  ['Can I import an existing project?', 'Yes. You can import a connected GitHub repository or a supported ZIP archive into your private workspace.'],
  ['Can I connect payments to my project?', 'LeonardX includes Paystack integration workflows for supported projects. Review the generated changes and test them before going live.'],
  ['Do I need to connect a custom domain?', 'No custom domain is required to start a project. Available hosting and project URL options depend on your account and deployment configuration.'],
];
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      description: SITE_DESCRIPTION,
      url: SITE_ORIGIN,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <div>
        <PromptFirstLanding />
        <section aria-labelledby="home-faq-title" className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">{FAQ_SECTION_TITLE}</p>
          <h2 id="home-faq-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Frequently asked questions</h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white px-6">
            {faqs.map(([question, answer]) => (
              <details key={question} className="py-5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">{question}</summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
