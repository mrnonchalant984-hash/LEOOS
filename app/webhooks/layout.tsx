import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "LeonardX Webhooks",
  description: "Learn how LeonardX webhooks report supported project, deployment and API usage events to connected applications.",
  path: "/webhooks",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
