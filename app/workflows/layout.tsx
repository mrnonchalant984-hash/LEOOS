import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Workflows for Software Projects',
  description: 'Explore workflow tools for organizing AI-assisted software tasks, project execution and delivery.',
  alternates: { canonical: '/workflows' },
  openGraph: { title: 'AI Workflows for Software Projects', description: 'Explore workflow tools for organizing AI-assisted software tasks, project execution and delivery.', url: '/workflows', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'AI Workflows for Software Projects', description: 'Explore workflow tools for organizing AI-assisted software tasks, project execution and delivery.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
