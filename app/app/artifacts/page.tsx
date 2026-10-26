import { LeoWorkspaceFrame } from '@/components/LeoWorkspaceSidebar';
import { WorkspaceArtifacts } from '@/components/WorkspaceArtifacts';
import { getUserAccess } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function WorkspaceArtifactsPage() {
  const access = await getUserAccess();
  if (!access) redirect('/auth?next=%2Fapp%2Fartifacts');
  return <LeoWorkspaceFrame active="artifacts"><div className="mx-auto max-w-6xl px-8 py-16 lg:px-16"><header className="flex flex-wrap items-center justify-between gap-5"><div><h1 className="text-3xl font-semibold tracking-tight">Artifacts</h1><div className="mt-6 flex gap-5 text-sm"><button type="button" className="rounded-lg bg-white/[.12] px-3 py-1.5 text-white">All</button><span className="py-1.5 text-zinc-500">Yours</span><span className="py-1.5 text-zinc-500">Shared with you</span></div></div></header><div className="mt-12"><WorkspaceArtifacts/></div></div></LeoWorkspaceFrame>;
}
