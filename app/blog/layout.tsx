import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "AI Software Development Blog",
  description: "Read LeonardX articles about AI-assisted software development, website planning, freelance workflows and practical developer tools.",
  path: "/blog",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
