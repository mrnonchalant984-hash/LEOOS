import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';
import { getCloudflarePreviewConfig } from '@/lib/cloudflare-preview/config';
import {
  MAX_CLOUDFLARE_PREVIEW_FILE_BYTES,
  MAX_CLOUDFLARE_PREVIEW_FILES,
  MAX_CLOUDFLARE_PREVIEW_TOTAL_BYTES,
  validateStaticPreviewFiles,
} from '@/lib/cloudflare-preview/static-assets';

type RouteContext = { params: Promise<{ id: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailableResponse() {
  return NextResponse.json({
    error: 'Cloudflare static previews are not configured.',
    requiredEnvironment: getCloudflarePreviewConfig().requiredEnvironment,
  }, { status: 503 });
}

function admissionErrorResponse(error: { code?: string; message?: string }) {
  const message = error.message || '';
  if (message.includes('preview_job_active')) {
    return NextResponse.json({ error: 'A preview is already queued or running for this project.' }, { status: 409 });
  }
  if (message.includes('preview_user_daily_limit')) {
    return NextResponse.json({ error: 'The per-account daily preview limit has been reached.' }, { status: 429 });
  }
  if (message.includes('preview_user_monthly_limit')) {
    return NextResponse.json({ error: 'Your monthly build allowance has been reached.' }, { status: 429 });
  }
  if (message.includes('preview_account_monthly_limit')) {
    return NextResponse.json({ error: 'The Cloudflare preview capacity limit has been reached. Try again later.' }, { status: 429 });
  }
  if (message.includes('preview_project_not_found')) {
    return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  }
  console.error('Cloudflare preview admission failed:', error.code || 'unknown');
  return NextResponse.json({ error: 'A Cloudflare preview job could not be created.' }, { status: 503 });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Workspace ID is invalid.' }, { status: 400 });
  const { data: preview, error } = await adminSupabase().from('cloudflare_preview_jobs')
    .select('id,status,branch_name,deployment_url,error_code,created_at,completed_at')
    .eq('project_id', id)
    .eq('user_id', context.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Preview status could not be loaded. Apply the Cloudflare preview migration.' }, { status: 503 });
  return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const config = getCloudflarePreviewConfig();
  if (!config.enabled) return unavailableResponse();

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Workspace ID is invalid.' }, { status: 400 });
  const db = adminSupabase();
  const { data: project, error: projectError } = await db.from('projects')
    .select('id,type,files')
    .eq('id', id)
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: 'Workspace could not be loaded.' }, { status: 503 });
  if (!project) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const owner = isPlatformOwner(context.profile);
  const plan = await getEffectiveUserPlan(context.user.id, owner);
  const projectType = typeof project.type === 'string' ? project.type : '';
  const requiredFeature = projectType === 'saas' ? 'saas-builder' : projectType === 'web_app' ? 'web-app-builder' : 'website-builder';
  if (!plan.projectTypes.includes(projectType as 'website' | 'web_app' | 'saas') || !planAllows(plan, requiredFeature)) {
    return NextResponse.json({ error: 'Static previews are not included for this project type or plan.' }, { status: 403 });
  }

  const validation = validateStaticPreviewFiles(project.files);
  if (!validation.ok) {
    const error = validation.code === 'missing_index'
      ? 'A root index.html file is required for a static preview.'
      : validation.code === 'unsupported_file'
        ? 'Only prebuilt static assets are supported. Build frameworks and server-side source files are not executed.'
        : validation.code === 'sensitive_credential'
          ? 'Static assets contain a recognizable credential pattern. Remove sensitive values before creating a public preview.'
        : validation.code === 'file_too_large' || validation.code === 'too_many_files'
          ? 'Static preview assets exceed the configured file-count or size limits.'
          : 'Workspace files are not a valid static preview bundle.';
    return NextResponse.json({
      error,
      limits: {
        files: MAX_CLOUDFLARE_PREVIEW_FILES,
        fileBytes: MAX_CLOUDFLARE_PREVIEW_FILE_BYTES,
        totalBytes: MAX_CLOUDFLARE_PREVIEW_TOTAL_BYTES,
      },
    }, { status: 422 });
  }

  const { data, error } = await db.rpc('create_cloudflare_preview_job', {
    p_user_id: context.user.id,
    p_project_id: id,
    p_static_files: validation.files,
    p_monthly_limit: plan.limits.monthlyBuilds,
  });
  if (error) return admissionErrorResponse(error);
  const job = Array.isArray(data) ? data[0] : data;
  if (!job || typeof job !== 'object') {
    console.error('Cloudflare preview admission returned no job.');
    return NextResponse.json({ error: 'A Cloudflare preview job could not be created.' }, { status: 503 });
  }
  return NextResponse.json({
    preview: {
      id: job.id,
      status: job.status,
      branch_name: job.branch_name,
      created_at: job.created_at,
    },
  }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
