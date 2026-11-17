import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'About',
  description: "Meet Leonard Udoh and learn about Braverton, an AI-assisted software workspace built to help turn project ideas into working software.",
  path: "/about",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
