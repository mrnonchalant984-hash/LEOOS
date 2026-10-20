import WebIde from '@/components/ide/WebIde';

type WorkspaceIdePageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkspaceIdePage({ params }: WorkspaceIdePageProps) {
  const { workspaceId } = await params;
  return <WebIde workspaceId={workspaceId} />;
}
