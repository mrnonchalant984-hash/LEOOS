import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Integrations — Connect Your Development Tools',
  description: 'Explore LeonardX integration paths for software development, project delivery, APIs and connected services.',
  alternates: { canonical: '/integrations' },
  openGraph: { title: 'Integrations — Connect Your Development Tools', description: 'Explore LeonardX integration paths for software development, project delivery, APIs and connected services.', url: '/integrations', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Integrations — Connect Your Development Tools', description: 'Explore LeonardX integration paths for software development, project delivery, APIs and connected services.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
