import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Review how LeonardX handles information when you use its website and services.',
  alternates: { canonical: '/privacy' },
  openGraph: { title: 'Privacy Policy', description: 'Review how LeonardX handles information when you use its website and services.', url: '/privacy', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Privacy Policy', description: 'Review how LeonardX handles information when you use its website and services.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
