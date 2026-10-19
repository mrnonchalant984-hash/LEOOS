import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Development Resources',
  description: "Browse resources for AI-assisted coding, web development, software project planning and LeonardX workflows.",
  path: "/resources",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
