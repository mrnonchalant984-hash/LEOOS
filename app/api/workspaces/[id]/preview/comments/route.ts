import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime='nodejs';
type Ctx={params:Promise<{id:string}>};
export async function POST(req:NextRequest,{params}:Ctx){
 const auth=await getProfile(req);
 if(!auth) return NextResponse.json({error:'Sign in to comment on this preview.'},{status:401});
 const {id}=await params;
 const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
 const token=typeof body?.share_token==='string'?body.share_token:'';
 const comment=typeof body?.body==='string'?body.body.trim():'';
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[A-Za-z0-9_-]{40,60}$/.test(token)||!comment||comment.length>4000)
  return NextResponse.json({error:'Valid share token and comment (1–4000 characters) are required.'},{status:400});
 const db=adminSupabase(), hash=createHash('sha256').update(token).digest('hex');
 const {data:share,error}=await db.from('bram_preview_shares').select('id,user_id,project_id,allow_comments,expires_at,status')
  .eq('share_token_hash',hash).eq('project_id',id).eq('status','active').maybeSingle();
 if(error) return NextResponse.json({error:'Share could not be verified.'},{status:503});
 if(!share||!share.allow_comments||(share.expires_at&&new Date(share.expires_at)<=new Date())) return NextResponse.json({error:'Comments are disabled or this share has expired.'},{status:404});
 const {data:project}=await db.from('projects').select('id').eq('id',id).eq('user_id',share.user_id).maybeSingle();
 if(!project) return NextResponse.json({error:'Project owner could not be verified.'},{status:404});
 const anchor=body?.anchor&&typeof body.anchor==='object'&&!Array.isArray(body.anchor)?body.anchor:{};
 const {data:created,error:insertError}=await db.from('bram_preview_comments').insert({
  share_id:share.id,project_id:id,user_id:share.user_id,author_user_id:auth.user.id,body:comment,anchor,status:'open'
 }).select('id,body,status,created_at').single();
 if(insertError) return NextResponse.json({error:'Comment could not be saved.'},{status:503});
 let edit={queued:false};
 // Owner-authored comments are actionable instructions; guest comments remain reviewable until owner approval.
 if(auth.user.id===share.user_id && body?.apply_to_bram===true){
  const sessionId=typeof body.session_id==='string'&&/^[0-9a-f-]{36}$/i.test(body.session_id)?body.session_id:null;
  if(!sessionId) return NextResponse.json({comment:created,edit:{queued:false,reason:'A Bram chat session is required to apply this comment.'}},{status:201});
  const response=await fetch(new URL('/api/chat',req.url),{
   method:'POST',headers:{'Content-Type':'application/json',...(req.headers.get('authorization')?{Authorization:req.headers.get('authorization')!}:{}),...(req.headers.get('cookie')?{Cookie:req.headers.get('cookie')!}:{})},
   body:JSON.stringify({session_id:sessionId,project_id:id,request_type:'repair',message:'Apply this preview feedback to the existing project. Preserve all existing functionality and structure. Review the current workspace before editing. Feedback: '+comment}),
   cache:'no-store',signal:AbortSignal.timeout(100000),
  });
  const result=await response.json().catch(()=>({}));
  if(response.ok){
   await db.from('bram_preview_comments').update({status:'queued',edit_request_id:sessionId,updated_at:new Date().toISOString()}).eq('id',created.id);
   edit={queued:true};
  } else edit={queued:false,reason:typeof result.error==='string'?result.error:'Bram could not accept the edit request.'};
 }
 return NextResponse.json({comment:created,edit},{status:201,headers:{'Cache-Control':'no-store'}});
}
