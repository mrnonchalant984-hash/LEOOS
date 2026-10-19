import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Privacy Policy',
  description: "Review how LeonardX handles account, project, payment and service information when you use its website and platform.",
  path: "/privacy",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
