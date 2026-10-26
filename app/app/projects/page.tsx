import Link from 'next/link';
import { ArrowUpDown, FolderKanban, Plus, Search } from 'lucide-react';
import { redirect } from 'next/navigation';
import { LeoWorkspaceFrame } from '@/components/LeoWorkspaceSidebar';
import { adminSupabase, getUserAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function WorkspaceProjectsPage() {
  const access = await getUserAccess();
  if (!access) redirect('/auth?next=%2Fapp%2Fprojects');
  const { data } = await adminSupabase().from('projects').select('id,project_name,type,status,progress,created_at').eq('user_id', access.user.id).order('created_at', { ascending: false }).limit(50);
  const projects = data || [];
  return <LeoWorkspaceFrame active="projects"><div className="mx-auto max-w-6xl px-8 py-16 lg:px-16"><header className="flex flex-wrap items-center justify-between gap-5"><h1 className="text-3xl font-semibold tracking-tight">Projects</h1><div className="flex items-center gap-3"><button type="button" aria-label="Search projects" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><Search size={19}/></button><button type="button" aria-label="Sort projects" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><ArrowUpDown size={18}/></button><Link href="/setup" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200"><Plus size={16}/> New project</Link></div></header>{projects.length ? <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/app?project_id=${encodeURIComponent(project.id)}`} className="group min-h-40 rounded-xl border border-white/10 bg-[#151515] p-5 transition hover:border-white/25 hover:bg-[#191919]"><div className="flex items-start justify-between gap-3"><FolderKanban size={20} className="text-[var(--gold)]"/><span className="text-[10px] uppercase tracking-wider text-zinc-600">{project.status || 'draft'}</span></div><h2 className="mt-10 truncate text-base font-medium text-zinc-100">{project.project_name || 'Untitled project'}</h2><p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{project.type || 'Project'} · {project.progress ?? 0}% complete</p></Link>)}</div> : <div className="flex min-h-[55vh] flex-col items-center justify-center text-center"><FolderKanban size={62} strokeWidth={1} className="text-zinc-300"/><h2 className="mt-7 text-lg font-medium">Looking to start a project?</h2><p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">Upload materials, set custom instructions, and organize conversations in one space.</p><Link href="/setup" className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">New project</Link></div>}</div></LeoWorkspaceFrame>;
}
