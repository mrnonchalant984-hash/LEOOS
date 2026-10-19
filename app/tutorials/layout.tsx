import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "LeonardX Tutorials",
  description: "Browse walkthroughs for using LeonardX across website projects, AI-assisted development, templates and developer tools.",
  path: "/tutorials",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
