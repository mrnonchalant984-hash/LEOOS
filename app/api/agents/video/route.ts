import {NextRequest,NextResponse} from 'next/server';
import {getProfile,adminSupabase} from '@/lib/auth';
import {getRunwayVideo} from '@/lib/agents/runway-video';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  try{
    const ctx=await getProfile(req);
    if(!ctx||ctx.profile.role!=='owner') return NextResponse.json({error:'Owner-only endpoint'},{status:403});
    const body=await req.json();
    const taskId=typeof body.task_id==='string'?body.task_id:'';
    const runId=typeof body.run_id==='string'?body.run_id:'';
    if(!taskId||!runId) return NextResponse.json({error:'task_id and run_id are required'},{status:400});
    const db=adminSupabase();
    const {data:run}=await db.from('agent_runs').select('id,user_id,agent_id').eq('id',runId).eq('user_id',ctx.user.id).maybeSingle();
    if(!run||run.agent_id!=='video') return NextResponse.json({error:'Video agent run not found'},{status:404});
    const result=await getRunwayVideo(taskId,runId,ctx.user.id);
    if(result.status==='completed') await db.from('agent_runs').update({status:'completed',result:JSON.stringify(result),completed_at:new Date().toISOString()}).eq('id',runId).eq('user_id',ctx.user.id);
    if(result.status==='failed') await db.from('agent_runs').update({status:'failed',error:result.error,completed_at:new Date().toISOString()}).eq('id',runId).eq('user_id',ctx.user.id);
    return NextResponse.json({run_id:runId,...result});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Video status check failed'},{status:500});}
}
