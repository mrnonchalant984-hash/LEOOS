import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tutorials — Learn LeonardX',
  description: 'Learn how to use LeonardX for AI-assisted website creation, software projects and developer workflows.',
  alternates: { canonical: '/tutorials' },
  openGraph: { title: 'Tutorials — Learn LeonardX', description: 'Learn how to use LeonardX for AI-assisted website creation, software projects and developer workflows.', url: '/tutorials', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Tutorials — Learn LeonardX', description: 'Learn how to use LeonardX for AI-assisted website creation, software projects and developer workflows.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
