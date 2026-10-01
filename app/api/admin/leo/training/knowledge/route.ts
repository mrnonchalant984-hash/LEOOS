import {NextRequest,NextResponse} from 'next/server';
import {requireOwner,adminSupabase} from '@/lib/auth';

async function guard(req:NextRequest){const c=await requireOwner(req);if(!c)return null;if(!c.profile.twofa_verified)return null;return c;}

export async function GET(req:NextRequest){
  const c=await guard(req); if(!c)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
  const db=adminSupabase(); const q=req.nextUrl.searchParams.get('q')||''; const category=req.nextUrl.searchParams.get('category')||'';
  let query=db.from('leo_knowledge').select('*').order('updated_at',{ascending:false}).limit(100);
  if(category)query=query.eq('category',category);
  if(q)query=query.or(`title.ilike.%${q.replace(/[%_]/g,'')}%,content.ilike.%${q.replace(/[%_]/g,'')}%`);
  const [{data:knowledge},{data:versions},{data:audit},{data:instructions},{data:modelConfig},{data:toolConfig}]=await Promise.all([
    query,db.from('leo_knowledge_versions').select('*').order('created_at',{ascending:false}).limit(100),
    db.from('leo_training_audit').select('*').order('created_at',{ascending:false}).limit(100),
    db.from('leo_system_instructions').select('*').order('updated_at',{ascending:false}).limit(20),
    db.from('leo_model_config').select('*').order('updated_at',{ascending:false}).limit(20),
    db.from('leo_tool_config').select('*').order('updated_at',{ascending:false}).limit(50)
  ]);
  return NextResponse.json({knowledge:knowledge||[],versions:versions||[],audit:audit||[],instructions:instructions||[],modelConfig:modelConfig||[],toolConfig:toolConfig||[]});
}

export async function POST(req:NextRequest){
  const c=await guard(req); if(!c)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
  const b=await req.json(); if(!b.title||!b.content)return NextResponse.json({error:'Title and content are required.'},{status:400});
  const db=adminSupabase();
  const row={title:String(b.title),content:String(b.content),category:String(b.category||'general'),tags:Array.isArray(b.tags)?b.tags:String(b.tags||'').split(',').map((x:string)=>x.trim()).filter(Boolean),source_type:String(b.source_type||'manual'),source_url:b.source_url||null,author:String(b.author||c.profile.full_name||'Leonard'),status:'active',reliability:Number(b.reliability??0.8),confidence:Number(b.confidence??0.8),version:1};
  const {data,error}=await db.from('leo_knowledge').insert(row).select().single(); if(error)return NextResponse.json({error:error.message},{status:500});
  await db.from('leo_knowledge_versions').insert({knowledge_id:data.id,version:1,snapshot:data,changed_by:c.user.id,change_type:'created'});
  await db.from('leo_training_audit').insert({actor_user_id:c.user.id,action:'knowledge_created',knowledge_id:data.id,details:{title:data.title}});
  return NextResponse.json({knowledge:data});
}

export async function PATCH(req:NextRequest){
  const c=await guard(req); if(!c)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
  const b=await req.json(); if(!b.id)return NextResponse.json({error:'Knowledge id is required.'},{status:400});
  const db=adminSupabase(); const {data:old}=await db.from('leo_knowledge').select('*').eq('id',b.id).single(); if(!old)return NextResponse.json({error:'Knowledge not found.'},{status:404});
  const version=Number(old.version||1)+1;
  const patch:any={version,updated_at:new Date().toISOString()};
  for(const k of ['title','content','category','source_type','source_url','author','status'])if(b[k]!==undefined)patch[k]=b[k];
  for(const k of ['reliability','confidence'])if(b[k]!==undefined)patch[k]=Number(b[k]);
  if(b.tags!==undefined)patch.tags=Array.isArray(b.tags)?b.tags:String(b.tags).split(',').map((x:string)=>x.trim()).filter(Boolean);
  const {data,error}=await db.from('leo_knowledge').update(patch).eq('id',b.id).select().single(); if(error)return NextResponse.json({error:error.message},{status:500});
  await db.from('leo_knowledge_versions').insert({knowledge_id:data.id,version,snapshot:data,changed_by:c.user.id,change_type:b.status==='archived'?'archived':'updated'});
  await db.from('leo_training_audit').insert({actor_user_id:c.user.id,action:'knowledge_updated',knowledge_id:data.id,details:{version,change:b}});
  return NextResponse.json({knowledge:data});
}
