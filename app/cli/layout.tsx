import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'CLI',
  description: "Learn about the LeonardX command-line interface for supported developer workflows, projects, model access and usage.",
  path: "/cli",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
