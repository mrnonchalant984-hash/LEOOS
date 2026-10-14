import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Software Development Blog',
  description: 'Guides and practical articles on AI-assisted software development, website creation, coding workflows and LeonardX.',
  alternates: { canonical: '/blog' },
  openGraph: { title: 'AI Software Development Blog', description: 'Guides and practical articles on AI-assisted software development, website creation, coding workflows and LeonardX.', url: '/blog', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'AI Software Development Blog', description: 'Guides and practical articles on AI-assisted software development, website creation, coding workflows and LeonardX.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
