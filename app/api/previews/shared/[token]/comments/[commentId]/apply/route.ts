import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { POST as resumeBramChat } from '@/app/api/chat/route';
export const runtime='nodejs';
type Ctx={params:Promise<{token:string;commentId:string}>};
export async function POST(req:NextRequest,{params}:Ctx){
 const auth=await getProfile(req);if(!auth)return NextResponse.json({error:'Sign in as the project owner to apply feedback.'},{status:401});
 const {token,commentId}=await params;
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token)||!/^[0-9a-f-]{36}$/i.test(commentId))return NextResponse.json({error:'Invalid share or comment.'},{status:400});
 const db=adminSupabase(),hash=createHash('sha256').update(token).digest('hex');
 const {data:share,error:se}=await db.from('bram_preview_shares').select('id,user_id,project_id,status,expires_at').eq('share_token_hash',hash).eq('status','active').maybeSingle();
 if(se)return NextResponse.json({error:'Share could not be verified.'},{status:503});
 if(!share||share.user_id!==auth.user.id||(share.expires_at&&new Date(share.expires_at)<=new Date()))return NextResponse.json({error:'Only the project owner can apply feedback from this active share.'},{status:403});
 const {data:comment,error:ce}=await db.from('bram_preview_comments').select('id,body,status').eq('id',commentId).eq('share_id',share.id).eq('user_id',auth.user.id).maybeSingle();
 if(ce)return NextResponse.json({error:'Comment could not be loaded.'},{status:503});
 if(!comment||!['open','failed'].includes(comment.status))return NextResponse.json({error:'Comment is missing or has already been applied.'},{status:409});
 const sessionId=randomUUID();
 const response=await resumeBramChat(new NextRequest(new URL('/api/chat',req.url),{method:'POST',headers:req.headers,body:JSON.stringify({session_id:sessionId,project_id:share.project_id,request_type:'repair',message:'Apply this reviewer feedback to the existing project. Inspect the current saved workspace before editing, preserve existing structure and features, implement the requested change, and report what was actually changed. Reviewer feedback: '+comment.body})}));
 const result=await response.json().catch(()=>({}));
 if(!response.ok){await db.from('bram_preview_comments').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',comment.id);return NextResponse.json({error:typeof result.error==='string'?result.error:'Bram could not apply this feedback.'},{status:response.status});}
 const {error:updateError}=await db.from('bram_preview_comments').update({status:'queued',edit_request_id:sessionId,updated_at:new Date().toISOString()}).eq('id',comment.id).eq('user_id',auth.user.id);
 if(updateError)return NextResponse.json({error:'Bram accepted the edit, but comment status could not be updated.'},{status:503});
 return NextResponse.json({applied:true,status:'queued',session_id:sessionId,reply:result.reply||null},{status:202,headers:{'Cache-Control':'no-store'}});
}
