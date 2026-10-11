import { NextRequest } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, withApiKey } from '@/lib/api-auth';
import { POST as deployProject } from '@/app/api/v1/projects/[id]/deploy/route';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(req, 'read', async (auth) => {
    const { id } = await params;
    const db = adminSupabase();
    const { data: project } = await db.from('projects').select('id').eq('id', id).eq('user_id', auth.userId).maybeSingle();
    if (!project) return apiResponse({ error: { code: 'NOT_FOUND', message: 'Project not found.' }, request_id: auth.requestId }, 404, auth.requestId);
    const { data: website } = await db.from('website_projects').select('id').eq('source_project_id', id).eq('owner_user_id', auth.userId).maybeSingle();
    if (!website) return apiResponse({ data: [], request_id: auth.requestId }, 200, auth.requestId);
    const { data, error } = await db.from('project_builds')
      .select('id,status,step,logs,error,deployment_id,deployment_url,created_at,started_at,completed_at')
      .eq('website_project_id', website.id)
      .eq('owner_user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Build history could not be loaded.' }, request_id: auth.requestId }, 500, auth.requestId);
    return apiResponse({ data: data || [], request_id: auth.requestId }, 200, auth.requestId);
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return deployProject(req, context);
}
