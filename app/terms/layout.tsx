import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "Terms of Service",
  description: "Read the terms governing access to LeonardX accounts, subscriptions, project builders and hosting services.",
  path: "/terms",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
