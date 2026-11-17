import WebIde from '@/components/ide/WebIde';

type WorkspaceIdePageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ session_id?: string }>;
};

export default async function WorkspaceIdePage({ params, searchParams }: WorkspaceIdePageProps) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  return <WebIde workspaceId={workspaceId} initialSessionId={query.session_id || ''} />;
}
