import { NextRequest,NextResponse } from 'next/server';
import { adminSupabase,getProfile } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const auth=await getProfile(req);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
 const projectId=req.nextUrl.searchParams.get('project_id')||'';
 if(!/^[0-9a-f-]{36}$/i.test(projectId))return NextResponse.json({error:'A valid project ID is required.'},{status:400});
 const db=adminSupabase();
 const {data:project,error:pe}=await db.from('projects').select('id').eq('id',projectId).eq('user_id',auth.user.id).maybeSingle();
 if(pe)return NextResponse.json({error:'Project ownership could not be verified.'},{status:503});
 if(!project)return NextResponse.json({error:'Project not found.'},{status:404});
 const after=Math.max(0,Number(req.nextUrl.searchParams.get('after'))||0);
 const {data,error}=await db.from('bram_worker_events').select('id,job_id,worker_id,worker_type,event_type,status,message,metadata,created_at')
  .eq('user_id',auth.user.id).eq('project_id',projectId).gt('id',after).order('id',{ascending:true}).limit(100);
 if(error)return NextResponse.json({error:'Worker events are unavailable.'},{status:503});
 return NextResponse.json({events:data||[]},{headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'}});
}
