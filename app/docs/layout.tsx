import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation — Guides and API Reference',
  description: 'Read LeonardX documentation for project workflows, developer tools, API usage, integrations and platform setup.',
  alternates: { canonical: '/docs' },
  openGraph: { title: 'Documentation — Guides and API Reference', description: 'Read LeonardX documentation for project workflows, developer tools, API usage, integrations and platform setup.', url: '/docs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Documentation — Guides and API Reference', description: 'Read LeonardX documentation for project workflows, developer tools, API usage, integrations and platform setup.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
