import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Braverton Demo Work — Braverton',
  description: 'Explore software, web development and digital product demos built with Braverton.',
  alternates: { canonical: '/portfolio' },
  openGraph: { title: 'Braverton Demo Work — Braverton', description: 'Explore software, web development and digital product demos built with Braverton.', url: '/portfolio', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Braverton Demo Work — Braverton', description: 'Explore software, web development and digital product demos built with Braverton.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
