import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About LeonardX — AI Software Creation',
  description: 'Learn about LeonardX, its product direction and the goal of making software creation more accessible.',
  alternates: { canonical: '/about' },
  openGraph: { title: 'About LeonardX — AI Software Creation', description: 'Learn about LeonardX, its product direction and the goal of making software creation more accessible.', url: '/about', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'About LeonardX — AI Software Creation', description: 'Learn about LeonardX, its product direction and the goal of making software creation more accessible.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
