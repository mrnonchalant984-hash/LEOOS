import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact LeonardX',
  description: 'Contact LeonardX about the platform, business websites, developer tools, support and partnerships.',
  alternates: { canonical: '/contact' },
  openGraph: { title: 'Contact LeonardX', description: 'Contact LeonardX about the platform, business websites, developer tools, support and partnerships.', url: '/contact', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Contact LeonardX', description: 'Contact LeonardX about the platform, business websites, developer tools, support and partnerships.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
