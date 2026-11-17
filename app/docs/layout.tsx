import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Documentation',
  description: "Read Braverton documentation for project workflows, developer tools, API usage, integrations and platform setup.",
  path: "/docs",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
