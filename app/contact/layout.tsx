import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Contact',
  description: "Contact LeonardX about the platform, website and software services, developer tools, support or partnerships.",
  path: "/contact",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
