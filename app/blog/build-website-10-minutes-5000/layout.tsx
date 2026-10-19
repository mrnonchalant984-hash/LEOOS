import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "Build a Professional Website on a Lean Budget",
  description: "A brief guide to planning a professional website on a lean budget, from choosing essential pages to reviewing AI-assisted work.",
  path: "/blog/build-website-10-minutes-5000",
  type: "article",
});
export default function ArticleLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
