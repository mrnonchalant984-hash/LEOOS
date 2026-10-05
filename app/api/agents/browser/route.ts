import {NextRequest,NextResponse} from 'next/server';
import {getProfile,adminSupabase} from '@/lib/auth';
import {getAgent} from '@/lib/agents/manager';
import {getHostedBrowserSession,respondToHostedBrowserApproval,continueHostedBrowserSession,deleteHostedBrowserSession} from '@/lib/agents/openai-browser';

export const runtime='nodejs';

async function ownerContext(req:NextRequest){
  const ctx=await getProfile(req);
  if(!ctx || ctx.profile.role!=='owner') return null;
  return ctx;
}

async function ownedRun(userId:string,runId:string){
  const db=adminSupabase();
  return db.from('agent_runs').select('id,user_id,agent_id,status,task,metadata').eq('id',runId).eq('user_id',userId).maybeSingle();
}

export async function POST(req:NextRequest){
  try{
    const ctx=await ownerContext(req);
    if(!ctx) return NextResponse.json({error:'Owner-only endpoint'},{status:403});
    const body=await req.json();
    const action=typeof body.action==='string'?body.action:'status';
    const sessionId=typeof body.session_id==='string'?body.session_id:'';
    const runId=typeof body.run_id==='string'?body.run_id:'';
    if(!sessionId && !runId) return NextResponse.json({error:'session_id or run_id is required'},{status:400});

    const db=adminSupabase();
    let resolvedSessionId=sessionId;
    let run:any=null;
    if(runId){
      const q=await ownedRun(ctx.user.id,runId);
      if(q.error) throw q.error;
      if(!q.data) return NextResponse.json({error:'Agent run not found'},{status:404});
      run=q.data;
      resolvedSessionId=resolvedSessionId || String(run.metadata?.browser_session_id||'');
    }
    if(!resolvedSessionId) return NextResponse.json({error:'Browser session is not attached to this run'},{status:400});

    if(action==='status'){
      const session=await getHostedBrowserSession(resolvedSessionId);
      return NextResponse.json({status:session.status||'unknown',session_id:resolvedSessionId,required_actions:session.required_actions||[],metadata:run?.metadata||null});
    }

    if(action==='approve'){
      const approval=body.approval;
      if(!approval || typeof approval.request_id!=='string') return NextResponse.json({error:'approval.request_id is required'},{status:400});
      const current=await getHostedBrowserSession(resolvedSessionId);
      const pending=(current.required_actions||[]).find((x:any)=>x?.request_id===approval.request_id && x?.type==='computer_use_approval_request');
      if(!pending) return NextResponse.json({error:'Approval request is no longer pending'},{status:409});
      const requestType=pending.request?.type;
      if(requestType==='browser_origin_access'){
        const decision=approval.decision==='deny'?'deny':approval.decision==='cancel'?'cancel':'approve';
        await respondToHostedBrowserApproval(resolvedSessionId,{request_id:approval.request_id,type:requestType,decision});
      }else if(requestType==='browser_authentication'){
        if(approval.action==='cancel'){
          await respondToHostedBrowserApproval(resolvedSessionId,{request_id:approval.request_id,type:requestType,action:'cancel'});
        }else{
          const fields=Array.isArray(approval.fields)?approval.fields.map((f:any)=>({field_id:String(f.field_id),value:String(f.value||'')})):[];
          await respondToHostedBrowserApproval(resolvedSessionId,{request_id:approval.request_id,type:requestType,action:'submit',selected_option:approval.selected_option,fields});
        }
      }else return NextResponse.json({error:`Unsupported approval type: ${requestType}`},{status:400});
      if(runId) await db.from('agent_runs').update({metadata:{...(run?.metadata||{}),browser_status:'running',browser_approvals:[]}}).eq('id',runId).eq('user_id',ctx.user.id);
      return NextResponse.json({status:'accepted',session_id:resolvedSessionId});
    }

    if(action==='continue'){
      const result=await continueHostedBrowserSession(resolvedSessionId,runId||undefined);
      if(runId && result.status==='completed') await db.from('agent_runs').update({status:'completed',result:result.result,completed_at:new Date().toISOString()}).eq('id',runId).eq('user_id',ctx.user.id);
      return NextResponse.json(result);
    }

    if(action==='delete'){
      await deleteHostedBrowserSession(resolvedSessionId);
      if(runId) await db.from('agent_runs').update({status:'cancelled',completed_at:new Date().toISOString(),metadata:{...(run?.metadata||{}),browser_status:'deleted'}}).eq('id',runId).eq('user_id',ctx.user.id);
      return NextResponse.json({status:'deleted',session_id:resolvedSessionId});
    }

    return NextResponse.json({error:'Unknown action'},{status:400});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Browser agent operation failed'},{status:500});
  }
}
