import { after, NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { apiResponse, withApiKey } from '@/lib/api-auth';
import { POST as buildDeploy } from '@/app/api/build-deploy/route';
import { emitWebhookEvent } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * API-key entry point for the existing production builder. It creates only the
 * missing linkage record, then delegates to the same OpenAI/GitHub/Vercel flow
 * used by the authenticated web dashboard.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(req, 'write', async (auth) => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = adminSupabase();
    const { data: source, error: sourceError } = await db.from('projects')
      .select('id,project_name,type,status')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (sourceError) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'Project could not be loaded.' }, request_id: auth.requestId }, 500, auth.requestId);
    if (!source) return apiResponse({ error: { code: 'NOT_FOUND', message: 'Project not found.' }, request_id: auth.requestId }, 404, auth.requestId);

    const projectType = ['website', 'web_app', 'saas'].includes(String(source.type)) ? String(source.type) : 'web_app';
    let { data: websiteProject } = await db.from('website_projects')
      .select('id')
      .eq('source_project_id', source.id)
      .eq('owner_user_id', auth.userId)
      .maybeSingle();
    if (!websiteProject) {
      const created = await db.from('website_projects').insert({
        owner_user_id: auth.userId,
        source_project_id: source.id,
        project_type: projectType,
        website_type: projectType,
        business_name: source.project_name,
        requirements: { source: 'developer-api', source_project_id: source.id },
      }).select('id').single();
      if (created.error || !created.data) return apiResponse({ error: { code: 'DATABASE_ERROR', message: 'The deployment workspace could not be prepared.' }, request_id: auth.requestId }, 500, auth.requestId);
      websiteProject = created.data;
    }

    const brief = typeof body.brief === 'string' && body.brief.trim()
      ? body.brief.trim().slice(0, 6000)
      : `Build and deploy the ${source.project_name} project using its current workspace brief.`;
    const forwardedHeaders = new Headers(req.headers);
    forwardedHeaders.set('X-Request-ID', auth.requestId);
    const internalRequest = new NextRequest(new URL('/api/build-deploy', req.url), {
      method: 'POST',
      headers: forwardedHeaders,
      body: JSON.stringify({
        ...body,
        prompt: brief,
        project_id: websiteProject.id,
        website_type: projectType,
      }),
    });
    const result = await buildDeploy(internalRequest);
    if (result.status >= 200 && result.status < 300) {
      await db.from('projects').update({ status: 'deployed', progress: 100 }).eq('id', source.id).eq('user_id', auth.userId);
      after(async () => { try { await emitWebhookEvent(auth.userId, 'project.deployed', { project_id: source.id, project_name: source.project_name }); } catch { /* queued delivery retries handle transient failures */ } });
    }
    return new NextResponse(result.body, { status: result.status, statusText: result.statusText, headers: result.headers });
  });
}
