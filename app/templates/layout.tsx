import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "Website and App Templates",
  description: "Explore website and web app starting points for company, portfolio, store, booking, blog and other project types.",
  path: "/templates",
  type: "website",
});

export default function PublicPageLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
