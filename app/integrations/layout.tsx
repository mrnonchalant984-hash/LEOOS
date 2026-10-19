import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Integrations',
  description: "Review integration paths for AI providers, data, hosting, payments and source control used by LeonardX.",
  path: "/integrations",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
