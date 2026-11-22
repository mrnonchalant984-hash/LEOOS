import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(req:NextRequest){
 const auth=await getProfile(req);if(!auth)return json({error:'Authentication required.'},401);
 const id=req.nextUrl.searchParams.get('id')||'';
 let q=adminSupabase().from('bram_website_intakes').select('id,session_id,project_id,website_project_id,request_id,status,requirements,missing_requirements,created_at,updated_at').eq('user_id',auth.user.id).order('updated_at',{ascending:false}).limit(20);
 if(id){if(!uuid.test(id))return json({error:'Invalid intake ID.'},400);q=q.eq('id',id);}
 const {data,error}=await q;if(error)return json({error:'Website intake could not be loaded.'},503);
 return json({intakes:data||[]});
}
export async function POST(req:NextRequest){
 const auth=await getProfile(req);if(!auth)return json({error:'Authentication required.'},401);
 const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body)return json({error:'Invalid JSON body.'},400);
 const intakeId=typeof body.id==='string'?body.id:'';
 if(intakeId&&!uuid.test(intakeId))return json({error:'Invalid intake ID.'},400);
 const db=adminSupabase();
 let previous:Record<string,unknown>={};
 if(intakeId&&body.create_project===true){
  const {data,error}=await db.from('bram_website_intakes').select('requirements,session_id,request_id').eq('id',intakeId).eq('user_id',auth.user.id).maybeSingle();
  if(error)return json({error:'Saved website intake could not be loaded.'},503);
  if(!data)return json({error:'Website intake not found.'},404);
  previous=data.requirements&&typeof data.requirements==='object'&&!Array.isArray(data.requirements)?data.requirements as Record<string,unknown>:{};
 }
 const name=(typeof body.business_name==='string'?body.business_name:previous.business_name||'').toString().trim().slice(0,160);
 const projectType=['website','web_app','saas'].includes(String(body.project_type||previous.project_type))?String(body.project_type||previous.project_type):'website';
 const websiteType=typeof body.website_type==='string'?body.website_type:String(previous.website_type||'landing');
 const chatbot=typeof body.chatbot_enabled==='boolean'?body.chatbot_enabled:previous.chatbot_enabled===true;
 const paymentMode=(body.payment_mode||previous.payment_mode)==='automatic_paystack'?'automatic_paystack':'manual_email';
 const requirements=body.requirements&&typeof body.requirements==='object'&&!Array.isArray(body.requirements)?body.requirements as Record<string,unknown>:previous;
 if(JSON.stringify(requirements).length>12000)return json({error:'Requirements exceed the 12 KB limit.'},400);
 const missing:string[]=[];
 if(!name)missing.push('business_name');
 if(!requirements.description)missing.push('description');
 if(!Array.isArray(requirements.pages)||requirements.pages.length===0)missing.push('pages');
 const payload={user_id:auth.user.id,session_id:typeof body.session_id==='string'&&uuid.test(body.session_id)?body.session_id:typeof previous.session_id==='string'?previous.session_id:null,
  request_id:typeof body.request_id==='string'&&uuid.test(body.request_id)?body.request_id:typeof previous.request_id==='string'?previous.request_id:null,status:missing.length?'collecting':'ready',
  requirements:{...requirements,business_name:name,project_type:projectType,website_type:websiteType,chatbot_enabled:chatbot,payment_mode:paymentMode},
  missing_requirements:missing,updated_at:new Date().toISOString()};
 let saved:any,error:any;
 if(intakeId){const r=await db.from('bram_website_intakes').update(payload).eq('id',intakeId).eq('user_id',auth.user.id).select('id').maybeSingle();saved=r.data;error=r.error;}
 else {const r=await db.from('bram_website_intakes').insert(payload).select('id').single();saved=r.data;error=r.error;}
 if(error||!saved)return json({error:'Website intake could not be saved.'},503);
 if(body.create_project!==true)return json({intake:{id:saved.id,status:payload.status,missing_requirements:missing,requirements:payload.requirements},created:false},200);
 if(missing.length)return json({error:'Complete the required website details before creating the project.',intake:{id:saved.id,status:'collecting',missing_requirements:missing}},422);
 const setupUrl=new URL('/api/setup/projects',req.url);
 const response=await fetch(setupUrl,{method:'POST',headers:{'Content-Type':'application/json',
  ...(req.headers.get('authorization')?{Authorization:req.headers.get('authorization')!}:{}),
  ...(req.headers.get('cookie')?{Cookie:req.headers.get('cookie')!}:{})},
  body:JSON.stringify({project_type:projectType,business_name:name,website_type:websiteType,chatbot_enabled:chatbot,payment_mode:paymentMode,requirements}),
  cache:'no-store',signal:AbortSignal.timeout(30000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)return json({error:typeof result.error==='string'?result.error:'Project creation failed.',intake:{id:saved.id,status:'ready'}},response.status);
 const project=result.project as Record<string,unknown>|undefined;
 const projectId=typeof project?.id==='string'?project.id:'';
 if(!uuid.test(projectId))return json({error:'Project creation returned no valid project identifier.',intake:{id:saved.id,status:'ready'}},502);
 const {error:updateError}=await db.from('bram_website_intakes').update({
  website_project_id:projectId,status:'created',missing_requirements:[],updated_at:new Date().toISOString()
 }).eq('id',saved.id).eq('user_id',auth.user.id);
 if(updateError)return json({error:'Project was created but intake status could not be updated.',project},503);
 return json({intake:{id:saved.id,status:'created',website_project_id:projectId},project,created:true},201);
}
