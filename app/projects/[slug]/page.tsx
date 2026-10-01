import { notFound } from 'next/navigation';
import Link from 'next/link';
import { big12Projects } from '@/data/site';

export function generateStaticParams(){ return big12Projects.map(p=>({slug:p.id})); }

export default async function ProjectPreview({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const project=big12Projects.find(p=>p.id===slug);
  if(!project) notFound();
  return <main className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
    <Link href="/projects" className="text-sm text-yellow-300">← Back to projects</Link>
    <section className="mt-8 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl">
      <div className="relative aspect-[16/8] bg-zinc-900">
        <img src={project.image} alt={project.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6"><p className="text-sm font-bold uppercase tracking-[.18em] text-yellow-300">{project.type}</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">{project.name}</h1></div>
      </div>
      <div className="grid gap-8 p-7 sm:p-10 md:grid-cols-[1.4fr_.6fr]">
        <div><h2 className="text-2xl font-bold">Interactive project preview</h2><p className="mt-4 leading-8 text-zinc-400">{project.description} This preview is a functional LEO OS project showcase route. Replace the optional public project URL with a real deployed URL when it is available.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/contact" className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">Start a project</Link><Link href="/app" className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">Ask Leo</Link></div></div>
        <div className="rounded-2xl border border-zinc-800 bg-black/50 p-5"><p className="text-xs uppercase tracking-widest text-zinc-500">Project status</p><p className="mt-2 font-bold text-yellow-300">Functional preview</p><p className="mt-4 text-sm text-zinc-500">No account is required to view this page.</p></div>
      </div>
    </section>
  </main>
}
