import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "Braverton Webhooks",
  description: "Learn how Braverton webhooks report supported project, deployment and API usage events to connected applications.",
  path: "/webhooks",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
