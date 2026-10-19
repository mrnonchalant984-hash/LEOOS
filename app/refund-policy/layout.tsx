import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Refund Policy',
  description: "Review refund terms for LeonardX subscriptions, digital services and separately paid hosting.",
  path: "/refund-policy",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
