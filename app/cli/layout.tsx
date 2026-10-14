import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CLI — Developer Command Line Tools',
  description: 'Learn about the LeonardX command-line interface for developer workflows, projects, model access and usage.',
  alternates: { canonical: '/cli' },
  openGraph: { title: 'CLI — Developer Command Line Tools', description: 'Learn about the LeonardX command-line interface for developer workflows, projects, model access and usage.', url: '/cli', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'CLI — Developer Command Line Tools', description: 'Learn about the LeonardX command-line interface for developer workflows, projects, model access and usage.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
