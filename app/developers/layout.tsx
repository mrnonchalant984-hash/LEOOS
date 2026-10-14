import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developer Platform — API, SDKs and CLI',
  description: 'Explore LeonardX developer tools, API access, SDKs, CLI workflows, usage and integrations for building software.',
  alternates: { canonical: '/developers' },
  openGraph: { title: 'Developer Platform — API, SDKs and CLI', description: 'Explore LeonardX developer tools, API access, SDKs, CLI workflows, usage and integrations for building software.', url: '/developers', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Developer Platform — API, SDKs and CLI', description: 'Explore LeonardX developer tools, API access, SDKs, CLI workflows, usage and integrations for building software.' },
};

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
