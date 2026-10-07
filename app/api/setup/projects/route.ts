import {NextRequest,NextResponse} from 'next/server'; import {getProfile,adminSupabase} from '@/lib/auth'; import {getEffectiveUserPlan,planAllows} from '@/lib/plan-access';
import {getBuilderAvailability,supportedProjectTypes} from '@/lib/builders/providers'; import type {ProjectType} from '@/lib/pricing';

const websiteTypes = new Set(['company','portfolio','agency','restaurant','real_estate','ecommerce','digital_products','booking','membership','saas','blog','magazine','forum','event','school','course','church_ngo','government','landing','cv']);
const paymentModes = new Set(['automatic_paystack','manual_email']);
const projectTypes = new Set(['website','web_app','saas','mobile_app','game']);

export async function GET(req:NextRequest){
 const ctx=await getProfile(req);
 if(!ctx)return NextResponse.json({error:'Login required'},{status:401});
 const id=req.nextUrl.searchParams.get('project_id');
 const owner=ctx.profile.role==='owner'&&ctx.profile.email?.toLowerCase()===(process.env.OWNER_EMAIL||'leonardudoh5@gmail.com').toLowerCase();
 const plan=await getEffectiveUserPlan(ctx.user.id,owner);
 if(!id){
  const providers=Object.fromEntries(supportedProjectTypes.map(type=>[type,getBuilderAvailability(type)]));
  const projectTypes=plan.projectTypes.filter(type=>getBuilderAvailability(type).status==='ready');
  return NextResponse.json({capabilities:{plan:plan.key,projectTypes,planProjectTypes:plan.projectTypes,limits:plan.limits,providers}});
 }
 const {data,error}=await adminSupabase().from('website_projects')
  .select('id,owner_user_id,project_type,website_type,business_name,chatbot_enabled,payment_mode,requirements,status,live_url,admin_url,github_repo,build_provider,build_status,build_step,last_build_at,created_at,updated_at')
  .eq('id',id).eq('owner_user_id',ctx.user.id).maybeSingle();
 if(error)return NextResponse.json({error:'Project could not be loaded.'},{status:500});
 if(!data)return NextResponse.json({error:'Project not found.'},{status:404});
 const db=adminSupabase();
 const [builds,deployments,hosting]=await Promise.all([
  db.from('project_builds').select('id,provider,status,step,logs,error,deployment_id,deployment_url,created_at,started_at,completed_at').eq('website_project_id',id).eq('owner_user_id',ctx.user.id).order('created_at',{ascending:false}).limit(10),
  db.from('deployment_events').select('id,event_type,status,message,metadata,created_at').eq('website_project_id',id).order('created_at',{ascending:false}).limit(10),
  db.from('hosting_subscriptions').select('id,status,plan,starts_at,ends_at,next_renewal_at,last_reminder_at').eq('website_project_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
 ]);
 if(builds.error||deployments.error||hosting.error)return NextResponse.json({error:'Project history could not be loaded.'},{status:500});
 return NextResponse.json({project:data,builds:builds.data||[],deployments:deployments.data||[],hosting:hosting.data||null},{headers:{'Cache-Control':'no-store, max-age=0'}});
}

export async function POST(req:NextRequest){
 const ctx=await getProfile(req);
 if(!ctx)return NextResponse.json({error:'Login required'},{status:401});
 try{
  const body=await req.json();
    const projectType=typeof body.project_type==='string'?body.project_type:'website';
  const websiteType=typeof body.website_type==='string'?body.website_type.trim():'';
  const businessName=typeof body.business_name==='string'?body.business_name.trim().slice(0,160):'';
  if(!projectTypes.has(projectType))return NextResponse.json({error:'Choose a valid project type.'},{status:400});
  const provider=getBuilderAvailability(projectType as ProjectType);
  if(provider.status!=='ready')return NextResponse.json({error:provider.message||'Build provider is not configured.',provider:provider.id,requiredEnvironment:provider.requiredEnvironment},{status:503});
  if(!websiteTypes.has(websiteType))return NextResponse.json({error:'Choose a valid website type.'},{status:400});
  if(!businessName)return NextResponse.json({error:'Business or project name is required.'},{status:400});
  if(typeof body.chatbot_enabled!=='boolean')return NextResponse.json({error:'Choose whether to enable the chatbot.'},{status:400});
  const paymentMode=typeof body.payment_mode==='string'?body.payment_mode:'manual_email';
  if(!paymentModes.has(paymentMode))return NextResponse.json({error:'Choose a valid payment option.'},{status:400});
  if(body.requirements!==undefined&&(!body.requirements||typeof body.requirements!=='object'||Array.isArray(body.requirements)))return NextResponse.json({error:'Project requirements must be an object.'},{status:400});
    const owner=ctx.profile.role==='owner'&&ctx.profile.email?.toLowerCase()===(process.env.OWNER_EMAIL||'leonardudoh5@gmail.com').toLowerCase();
    const plan=await getEffectiveUserPlan(ctx.user.id,owner);
  const requiredFeature=projectType==='saas'?'saas-builder':projectType==='web_app'?'web-app-builder':'website-builder';
    if(!planAllows(plan,requiredFeature)||!plan.projectTypes.includes(projectType))return NextResponse.json({error:'This project type is not included in your current plan.',upgrade_url:'/pricing'},{status:403});
    const db=adminSupabase();
    const {data:projectId,error}=await db.rpc('create_customer_project',{
     p_owner_user_id:ctx.user.id,p_project_type:projectType,p_website_type:websiteType,p_business_name:businessName,
     p_chatbot_enabled:body.chatbot_enabled,p_payment_mode:paymentMode,p_requirements:body.requirements||{},p_project_limit:plan.limits.maxProjects,
    });
    if(error){const status=error.message?.includes('Project limit reached')?409:500;return NextResponse.json({error:error.message,upgrade_url:status===409?'/pricing':undefined},{status});}
    const {data,error:readError}=await db.from('website_projects').select('*').eq('id',projectId).eq('owner_user_id',ctx.user.id).single();
    if(readError)return NextResponse.json({error:'Project was created but could not be loaded.'},{status:500});
    return NextResponse.json({project:data},{status:201});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'Invalid project submission.'},{status:400});
 }
}
