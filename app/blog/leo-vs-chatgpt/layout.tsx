import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: "Leo OS vs ChatGPT: Choosing an AI Workflow",
  description: "Compare project-centered AI software work in Leo OS with general-purpose chat and consider which workflow fits a software project.",
  path: "/blog/leo-vs-chatgpt",
  type: "article",
});
export default function ArticleLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
