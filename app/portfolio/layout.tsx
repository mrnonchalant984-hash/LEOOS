import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeonardX Portfolio — Software and Web Projects',
  description: 'Explore selected software, web development and digital product work associated with LeonardX.',
  alternates: { canonical: '/portfolio' },
  openGraph: { title: 'LeonardX Portfolio — Software and Web Projects', description: 'Explore selected software, web development and digital product work associated with LeonardX.', url: '/portfolio', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'LeonardX Portfolio — Software and Web Projects', description: 'Explore selected software, web development and digital product work associated with LeonardX.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
