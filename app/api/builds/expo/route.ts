import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, isPlatformOwner } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { expoMetadataFiles, parseEasJson, runEasCommand, validateExpoProject, type EasProfile, type ExpoPlatform } from '@/lib/builders/expo-eas';
import { provisionExpoProject } from '@/lib/builders/expo-provisioning';
import { expectedExpoArtifactType } from '@/lib/builders/expo-artifact';
import { ensureExpoLockfile } from '@/lib/builders/expo-lockfile';
import { withExpoProjectId } from '@/lib/builders/expo-provisioning';

export const runtime = 'nodejs';
export const maxDuration = 300;

const platforms = new Set<ExpoPlatform>(['android', 'ios']);
const profiles = new Set<EasProfile>(['preview', 'production']);

function response(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function extractBuildId(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(extractBuildId).find(Boolean) || null;
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id === 'string' && /^[0-9a-f-]{20,}$/i.test(item.id)) return item.id;
  if (item.build) return extractBuildId(item.build);
  if (item.data) return extractBuildId(item.data);
  if (Array.isArray(item.builds)) return extractBuildId(item.builds);
  return null;
}

export async function POST(req: NextRequest) {
  const ctx = await getBuildActor(req, 'mcp:write');
  if (!ctx) return response(401, 'Login required.');
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-cloud-build', 3, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const projectId = typeof body?.project_id === 'string' ? body.project_id : '';
  const platform = body?.platform as ExpoPlatform;
  const profile = body?.profile as EasProfile;
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !platforms.has(platform) || !profiles.has(profile) || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return response(400, 'project_id, platform (android or ios), profile (preview or production), and UUID idempotency_key are required.');
  }
  if (!process.env.EXPO_TOKEN?.trim()) return response(503, 'Expo cloud builds are not configured. Set EXPO_TOKEN as a server-side secret.');
  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!planAllowsCloudProject(plan, 'mobile_app', owner)) {
    return NextResponse.json({ error: 'Mobile app builds are not included in your current plan. The owner must first configure an eligible higher-tier entitlement.', upgrade_url: '/pricing' }, { status: 403 });
  }
  const db = adminSupabase();
  const { data: project, error: projectError } = await db.from('projects')
    .select('id,project_name,type,files').eq('id', projectId).eq('user_id', ctx.user.id).maybeSingle();
  if (projectError) return response(503, 'Project ownership could not be checked.');
  if (!project) return response(404, 'Project not found.');
  if (project.type !== 'mobile_app') return response(400, 'Only a saved mobile app project can be built with Expo.');
  if (!project.files || typeof project.files !== 'object' || Array.isArray(project.files) ||
      !Object.values(project.files).every(value => typeof value === 'string')) {
    return response(422, 'The mobile app source files are invalid. Save a valid Expo workspace before building.');
  }
  let files = project.files as Record<string, string>;
  const sourceCheck = validateExpoProject(files, platform, profile);
  if (!sourceCheck.ok && !sourceCheck.error.startsWith('This Expo project is not linked.')) return response(422, sourceCheck.error);
  const { data: knownMapping, error: mappingError } = await db.from('cloud_build_jobs')
    .select('provider_project_id')
    .eq('owner_user_id', ctx.user.id)
    .eq('project_id', projectId)
    .eq('provider', 'expo-eas')
    .not('provider_project_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mappingError) return response(503, 'Expo build project mapping is unavailable. Apply the Expo cloud-build artifact migration before building.');
  let expoProjectId: string;
  try {
    const locked = await ensureExpoLockfile(files);
    files = locked.files;
    const provisioned = await provisionExpoProject(files, project.id, runEasCommand, process.env.EXPO_ACCOUNT_NAME, knownMapping?.provider_project_id || undefined);
    files = provisioned.files;
    expoProjectId = provisioned.expoProjectId;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const clientError = /requires a valid|needs a valid|does not match|could not be verified|not linked/i.test(message);
    return response(clientError ? 422 : 502, message || 'Expo project provisioning failed. Verify EXPO_TOKEN and Expo project-creation access, then retry.');
  }
  if (files['app.json'] !== project.files['app.json'] || files['package-lock.json'] !== project.files['package-lock.json']) {
    const { data: updated, error: updateError } = await db.from('projects').update({ files })
      .eq('id', projectId).eq('user_id', ctx.user.id).select('id').maybeSingle();
    if (updateError || !updated) return response(503, 'The verified Expo project link and generated Android identifiers could not be saved. No build was submitted.');
  }
  const checked = validateExpoProject(files, platform, profile);
  if (!checked.ok) return response(422, checked.error);
  const appJson = JSON.parse(files['app.json']);
  const expo = appJson.expo || appJson;
  if (platform === 'ios' && !expo.ios?.bundleIdentifier) return response(422, 'Set ios.bundleIdentifier in app.json before building for iOS.');
  if (platform === 'android' && !expo.android?.package) return response(422, 'Set android.package in app.json before building for Android.');

  const started = await db.rpc('start_cloud_build_job', {
    p_owner_user_id: ctx.user.id,
    p_project_id: projectId,
    p_provider: 'expo-eas',
    p_profile: `${platform}:${profile}`,
    p_idempotency_key: idempotencyKey,
    p_monthly_limit: plan.limits.monthlyBuilds,
  });
  if (started.error) {
    const limitedByPlan = started.error.message?.includes('Monthly build limit reached');
    return response(limitedByPlan ? 429 : 400, limitedByPlan ? 'Monthly build limit reached.' : 'Build job could not be authorized.');
  }
  const jobId = String(started.data?.[0]?.job_id || '');
  if (!jobId) return response(503, 'Build job was not persisted.');
  const { data: job } = await db.from('cloud_build_jobs').select('id,provider_job_id,provider_project_id,status')
    .eq('id', jobId).eq('owner_user_id', ctx.user.id).maybeSingle();
  if (!job) return response(503, 'Build job record could not be loaded.');
  if (job.provider_job_id) return NextResponse.json({ job_id: jobId, build_id: job.provider_job_id, status: job.status, deduplicated: true });
  if (started.data?.[0]?.created === false) return response(409, 'This idempotent build request has an unresolved result. Review the Expo dashboard before submitting a new build request.');
  const { error: mappingSaveError } = await db.from('cloud_build_jobs').update({
    provider_project_id: expoProjectId,
    artifact_expected_type: expectedExpoArtifactType(platform, profile, files),
    updated_at: new Date().toISOString(),
  }).eq('id', jobId).eq('owner_user_id', ctx.user.id);
  if (mappingSaveError) return response(503, 'The verified Expo project mapping could not be persisted. No provider build was submitted. Apply the Expo artifact migration and retry with the same idempotency key.');

  try {
    const result = await runEasCommand(files, ['build', '--platform', platform, '--profile', profile, '--json', '--non-interactive', '--no-wait']);
    const buildId = extractBuildId(parseEasJson(result.stdout));
    if (result.code !== 0 || !buildId) {
      const message = result.stderr.includes('429') || result.stdout.includes('429')
        ? 'Expo rate-limited this build request. Check the Expo account and retry with a new idempotency key later.'
        : 'EAS did not confirm a cloud build ID. Check the Expo project link, access, profile, and account build quota before retrying.';
      await db.from('cloud_build_jobs').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', jobId).eq('owner_user_id', ctx.user.id);
      return response(502, message);
    }
    const { error: updateError } = await db.from('cloud_build_jobs').update({
      provider_job_id: buildId,
      status: 'building',
      updated_at: new Date().toISOString(),
    })
      .eq('id', jobId).eq('owner_user_id', ctx.user.id);
    if (updateError) return response(503, 'Expo accepted a build, but LeonardX could not save its build ID. Contact the platform owner before retrying.');
    return NextResponse.json({ job_id: jobId, build_id: buildId, status: 'building' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('EXPO_TOKEN')
      ? 'Expo cloud builds are not configured. Set EXPO_TOKEN as a server-side secret.'
      : 'EAS could not confirm whether the build was created. Check Expo build history before submitting a new request.';
    await db.from('cloud_build_jobs').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', jobId).eq('owner_user_id', ctx.user.id);
    return response(502, message);
  }
}

export async function GET(req: NextRequest) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return response(401, 'Login required.');
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-project-link-check', 6, 60);
  if (limited) return limited;
  const projectId = req.nextUrl.searchParams.get('project_id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return response(400, 'A valid project_id is required.');
  if (!process.env.EXPO_TOKEN?.trim()) return response(503, 'EXPO_TOKEN is not configured on the server.');
  const { data: project, error } = await adminSupabase().from('projects').select('files,type')
    .eq('id', projectId).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return response(503, 'Project ownership could not be checked.');
  if (!project || project.type !== 'mobile_app') return response(404, 'Mobile app project not found.');
  const files = project.files;
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.values(files).every(value => typeof value === 'string')) return response(422, 'Project source files are invalid.');
  const checked = validateExpoProject(files, 'android', 'production');
  if (!checked.ok && !checked.error.startsWith('This Expo project is not linked.')) return response(422, checked.error);
  try {
    const db = adminSupabase();
    const { data: mapping, error: mappingError } = await db.from('cloud_build_jobs').select('provider_project_id')
      .eq('owner_user_id', ctx.user.id).eq('project_id', projectId).eq('provider', 'expo-eas')
      .not('provider_project_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (mappingError) return response(503, 'Expo project mapping is unavailable. Apply the Expo cloud-build artifact migration before building.');
    if (!mapping?.provider_project_id) {
      const identity = await runEasCommand(expoMetadataFiles(files), ['whoami', '--json', '--non-interactive'], 30_000);
      if (identity.code !== 0) return response(401, 'EXPO_TOKEN authentication failed. Configure a valid server-side Expo token.');
      return NextResponse.json({ configured: true, authenticated: true, linked: false, will_provision: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const linkedFiles = withExpoProjectId(files, mapping.provider_project_id);
    const result = await runEasCommand(expoMetadataFiles(linkedFiles), ['project:info', '--json', '--non-interactive'], 30_000);
    if (result.code !== 0) return response(401, 'Expo token authentication or persisted project access failed. Check the server-selected Expo account.');
    return NextResponse.json({ configured: true, authenticated: true, linked: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return response(502, 'Expo project authentication check could not be completed.'); }
}
