import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Website and App Templates',
  description: 'Explore project templates and starting points for building websites and web applications with LeonardX.',
  alternates: { canonical: '/templates' },
  openGraph: { title: 'Website and App Templates', description: 'Explore project templates and starting points for building websites and web applications with LeonardX.', url: '/templates', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Website and App Templates', description: 'Explore project templates and starting points for building websites and web applications with LeonardX.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
