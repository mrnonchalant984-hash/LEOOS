import WebIde from '@/components/ide/WebIde';

export default async function WorkspaceIdePage({ params }: PageProps<'/ide/[workspaceId]'>) {
  const { workspaceId } = await params;
  return <WebIde workspaceId={workspaceId} />;
}
