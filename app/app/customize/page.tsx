import { redirect } from 'next/navigation';
import { LeoWorkspaceFrame } from '@/components/LeoWorkspaceSidebar';
import { WorkspaceCustomize } from '@/components/WorkspaceCustomize';
import { getUserAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function WorkspaceCustomizePage() {
  const access = await getUserAccess();
  if (!access) redirect('/auth?next=%2Fapp%2Fcustomize');
  return <LeoWorkspaceFrame active="customize"><div className="mx-auto max-w-6xl px-8 py-16 lg:px-16"><WorkspaceCustomize/></div></LeoWorkspaceFrame>;
}
