import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Developer Platform',
  description: "Explore LeonardX developer tools, API access, SDKs, CLI workflows, usage and integrations for building software.",
  path: "/developers",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
