import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Development Resources',
  description: 'Practical resources for AI-assisted coding, web development, project workflows and building software with LeonardX.',
  alternates: { canonical: '/resources' },
  openGraph: { title: 'AI Development Resources', description: 'Practical resources for AI-assisted coding, web development, project workflows and building software with LeonardX.', url: '/resources', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'AI Development Resources', description: 'Practical resources for AI-assisted coding, web development, project workflows and building software with LeonardX.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
