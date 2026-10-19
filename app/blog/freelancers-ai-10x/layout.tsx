import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "How Freelancers Can Work Smarter with AI",
  description: "Explore practical ways freelancers can use AI to plan website projects, review code, prepare content and organize repeatable work.",
  path: "/blog/freelancers-ai-10x",
  type: "article",
});
export default function ArticleLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
