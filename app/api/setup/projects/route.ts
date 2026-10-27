import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllows, planAllowsCloudProject } from '@/lib/plan-access';
import { getBuilderAvailability, supportedProjectTypes } from '@/lib/builders/providers';
import { createBrowserGameStarter } from '@/lib/builders/browser-game-starter';
import { createExpoMobileStarter } from '@/lib/builders/expo-starter';
import type { ProjectType } from '@/lib/pricing';

const websiteTypes = new Set(['company','portfolio','agency','restaurant','real_estate','ecommerce','digital_products','booking','membership','saas','blog','magazine','forum','event','school','course','church_ngo','government','landing','cv']);
const paymentModes = new Set(['automatic_paystack','manual_email']);
const projectTypes = new Set<ProjectType>(['website','web_app','saas','mobile_app','game']);

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('project_id');
  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  const db = adminSupabase();
  if (!id) {
    const providers = Object.fromEntries(supportedProjectTypes.map(type => [type, getBuilderAvailability(type)]));
    const cloudTypes = (['mobile_app', 'game'] as const).filter(type => planAllowsCloudProject(plan, type, owner));
    const planProjectTypes = [...new Set([...plan.projectTypes, ...cloudTypes])];
    const projectTypes = planProjectTypes.filter(type => type === 'mobile_app' || type === 'game' || getBuilderAvailability(type).status === 'ready');
    const buildableProjectTypes = projectTypes.filter(type => getBuilderAvailability(type).status === 'ready');
    return NextResponse.json({ capabilities: { plan: plan.key, projectTypes, buildableProjectTypes, planProjectTypes, limits: plan.limits, providers } });
  }
  const { data: workspace, error: workspaceError } = await db.from('projects')
    .select('id,project_name,type,status,progress,files,created_at').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (workspaceError) return NextResponse.json({ error: 'Project could not be loaded.' }, { status: 503 });
  if (workspace && workspace.type === 'game') {
    return NextResponse.json({ project: workspace, builds: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  if (workspace && workspace.type === 'mobile_app') {
    const { data: builds, error } = await db.from('cloud_build_jobs')
      .select('id,provider,status,profile,error,created_at,updated_at,completed_at')
      .eq('project_id', id).eq('owner_user_id', ctx.user.id).eq('provider', 'expo-eas').order('created_at', { ascending: false }).limit(10);
    if (error) return NextResponse.json({ error: 'Project build history could not be loaded.' }, { status: 503 });
    return NextResponse.json({ project: workspace, builds: builds || [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  const { data, error } = await db.from('website_projects')
    .select('id,owner_user_id,project_type,website_type,business_name,chatbot_enabled,payment_mode,requirements,status,live_url,admin_url,github_repo,vercel_project_id,custom_domain,build_provider,build_status,build_step,last_build_at,created_at,updated_at')
    .eq('id', id).eq('owner_user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Project could not be loaded.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  const [builds, deployments, hosting] = await Promise.all([
    db.from('project_builds').select('id,provider,status,step,logs,error,deployment_id,deployment_url,created_at,started_at,completed_at').eq('website_project_id', id).eq('owner_user_id', ctx.user.id).order('created_at', { ascending: false }).limit(10),
    db.from('deployment_events').select('id,event_type,status,message,metadata,created_at').eq('website_project_id', id).order('created_at', { ascending: false }).limit(10),
    db.from('hosting_subscriptions').select('id,status,plan,starts_at,ends_at,next_renewal_at,last_reminder_at').eq('website_project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (builds.error || deployments.error || hosting.error) return NextResponse.json({ error: 'Project history could not be loaded.' }, { status: 500 });
  return NextResponse.json({ project: data, builds: builds.data || [], deployments: deployments.data || [], hosting: hosting.data || null }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  try {
    const body = await req.json();
    const projectType = typeof body.project_type === 'string' ? body.project_type as ProjectType : 'website';
    const name = typeof body.business_name === 'string' ? body.business_name.trim().slice(0, 160) : '';
    if (!projectTypes.has(projectType)) return NextResponse.json({ error: 'Choose a valid project type.' }, { status: 400 });
    if (!name) return NextResponse.json({ error: projectType === 'mobile_app' || projectType === 'game' ? 'Project name is required.' : 'Business or project name is required.' }, { status: 400 });
    const owner = isPlatformOwner(ctx.profile);
    const plan = await getEffectiveUserPlan(ctx.user.id, owner);
    const db = adminSupabase();
    const cloudType = projectType === 'mobile_app' || projectType === 'game';

    if (cloudType) {
      if (!planAllowsCloudProject(plan, projectType, owner)) return NextResponse.json({ error: 'This project type is not included in your current plan.', upgrade_url: '/pricing' }, { status: 403 });
      const requirements = body.requirements === undefined ? {} : body.requirements;
      if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements) || JSON.stringify(requirements).length > 12_000) {
        return NextResponse.json({ error: 'Project requirements must be a JSON object smaller than 12 KB.' }, { status: 400 });
      }
      const { count, error: countError } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id);
      if (countError) return NextResponse.json({ error: 'Project capacity could not be checked.' }, { status: 503 });
      if (!owner && (count || 0) >= plan.limits.maxProjects) return NextResponse.json({ error: 'Project limit reached.', upgrade_url: '/pricing' }, { status: 409 });
      const provider = getBuilderAvailability(projectType);
      const starter = projectType === 'game'
        ? createBrowserGameStarter(name, requirements)
        : createExpoMobileStarter(name, requirements);
      const { data, error } = await db.from('projects').insert({ user_id: ctx.user.id, project_name: name, type: projectType, status: 'draft', progress: 0, files: starter })
        .select('id,project_name,type,status,progress,created_at').single();
      if (error) return NextResponse.json({ error: 'Project workspace could not be created.' }, { status: 500 });
      return NextResponse.json({ project: data, buildSetupRequired: provider.status !== 'ready', provider: provider.id }, { status: 201 });
    }

    const websiteType = typeof body.website_type === 'string' ? body.website_type.trim() : '';
    if (!websiteTypes.has(websiteType)) return NextResponse.json({ error: 'Choose a valid website type.' }, { status: 400 });
    const provider = getBuilderAvailability(projectType);
    if (provider.status !== 'ready') return NextResponse.json({ error: provider.message || 'Build provider is not configured.', provider: provider.id, requiredEnvironment: provider.requiredEnvironment }, { status: 503 });
    if (typeof body.chatbot_enabled !== 'boolean') return NextResponse.json({ error: 'Choose whether to enable the chatbot.' }, { status: 400 });
    const paymentMode = typeof body.payment_mode === 'string' ? body.payment_mode : 'manual_email';
    if (!paymentModes.has(paymentMode)) return NextResponse.json({ error: 'Choose a valid payment option.' }, { status: 400 });
    if (body.requirements !== undefined && (!body.requirements || typeof body.requirements !== 'object' || Array.isArray(body.requirements))) return NextResponse.json({ error: 'Project requirements must be an object.' }, { status: 400 });
    const requiredFeature = projectType === 'saas' ? 'saas-builder' : projectType === 'web_app' ? 'web-app-builder' : 'website-builder';
    if (!planAllows(plan, requiredFeature) || !plan.projectTypes.includes(projectType)) return NextResponse.json({ error: 'This project type is not included in your current plan.', upgrade_url: '/pricing' }, { status: 403 });
    const { data: projectId, error } = await db.rpc('create_customer_project', {
      p_owner_user_id: ctx.user.id, p_project_type: projectType, p_website_type: websiteType, p_business_name: name,
      p_chatbot_enabled: body.chatbot_enabled, p_payment_mode: paymentMode, p_requirements: body.requirements || {}, p_project_limit: plan.limits.maxProjects,
    });
    if (error) {
      const status = error.message?.includes('Project limit reached') ? 409 : 500;
      return NextResponse.json({ error: error.message, upgrade_url: status === 409 ? '/pricing' : undefined }, { status });
    }
    const { data, error: readError } = await db.from('website_projects').select('*').eq('id', projectId).eq('owner_user_id', ctx.user.id).single();
    if (readError) return NextResponse.json({ error: 'Project was created but could not be loaded.' }, { status: 500 });
    return NextResponse.json({ project: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid project submission.' }, { status: 400 });
  }
}
