import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'Review LeonardX refund policy and applicable billing terms.',
  alternates: { canonical: '/refund-policy' },
  openGraph: { title: 'Refund Policy', description: 'Review LeonardX refund policy and applicable billing terms.', url: '/refund-policy', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Refund Policy', description: 'Review LeonardX refund policy and applicable billing terms.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
