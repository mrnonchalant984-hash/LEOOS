import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read the terms governing access to LeonardX and its services.',
  alternates: { canonical: '/terms' },
  openGraph: { title: 'Terms of Service', description: 'Read the terms governing access to LeonardX and its services.', url: '/terms', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Terms of Service', description: 'Read the terms governing access to LeonardX and its services.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
