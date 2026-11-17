import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "Choosing an AI Workflow: Braverton and General-Purpose AI",
  description: "Explore project-centered AI software work in Braverton with general-purpose chat and consider which workflow fits a software project.",
  path: "/blog/leo-vs-chatgpt",
  type: "article",
});
export default function ArticleLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
