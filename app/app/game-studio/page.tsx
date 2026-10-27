import { redirect } from 'next/navigation';
import { adminSupabase, getUserAccess } from '@/lib/auth';
import { LeoWorkspaceFrame } from '@/components/LeoWorkspaceSidebar';
import BrowserGameStudio from '@/components/games/BrowserGameStudio';

export const dynamic = 'force-dynamic';
export default async function BrowserGameStudioPage({ searchParams }: { searchParams: Promise<{ project_id?: string }> }) {
  const access = await getUserAccess();
  if (!access) redirect('/auth?next=%2Fapp%2Fgame-studio');
  const query = await searchParams;
  const { data, error } = await adminSupabase().from('projects')
    .select('id,project_name,type,status,progress,created_at')
    .eq('user_id', access.user.id).eq('type', 'game').order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error('Browser game projects could not be loaded.');
  return <LeoWorkspaceFrame active="games"><BrowserGameStudio initialProjects={data || []} initialSelectedId={query.project_id}/></LeoWorkspaceFrame>;
}
