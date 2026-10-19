import { createPublicMetadata } from '@/lib/seo';
import ProjectFilter from "@/components/ProjectFilter";
import { projects } from "@/data/site";
export const metadata = createPublicMetadata({
  title: "Projects Built with Leo OS",
  description: "Explore project previews built with Leo OS. Live links are shown only when a real deployed URL is configured.",
  path: "/projects",
  type: "website",
});
export default function Projects(){return <main><section className="section-grid border-b border-black/10"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><p className="text-sm font-bold uppercase tracking-[.18em] text-[#D4AF37]">LEO OS DEMO WORK</p><h1 className="mt-3 font-[var(--font-poppins)] text-5xl font-bold tracking-tight sm:text-6xl">Projects built with LeoOS</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-black/60">Explore demo work created with LeoOS. Live project links appear only when their real deployed URLs are configured; other entries are clearly marked as demos or awaiting a live URL.</p></div></section><section className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><ProjectFilter projects={projects}/></section></main>}
