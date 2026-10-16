import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeoOS Demo Work — LeonardX',
  description: 'Explore software, web development and digital product demos built with LeoOS.',
  alternates: { canonical: '/portfolio' },
  openGraph: { title: 'LeoOS Demo Work — LeonardX', description: 'Explore software, web development and digital product demos built with LeoOS.', url: '/portfolio', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'LeoOS Demo Work — LeonardX', description: 'Explore software, web development and digital product demos built with LeoOS.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
