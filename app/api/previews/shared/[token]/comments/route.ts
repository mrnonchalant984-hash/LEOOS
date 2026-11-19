import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime='nodejs';
type Ctx={params:Promise<{token:string}>};
export async function POST(req:NextRequest,{params}:Ctx){
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({error:'Share not found.'},{status:404});
 const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
 const comment=typeof body?.body==='string'?body.body.trim():'';
 if(!comment||comment.length>4000) return NextResponse.json({error:'Comment must contain 1–4000 characters.'},{status:400});
 const db=adminSupabase(),hash=createHash('sha256').update(token).digest('hex');
 const {data:share,error}=await db.from('bram_preview_shares').select('id,user_id,project_id,allow_comments,expires_at,status')
  .eq('share_token_hash',hash).eq('status','active').maybeSingle();
 if(error) return NextResponse.json({error:'Share could not be verified.'},{status:503});
 if(!share||!share.allow_comments||(share.expires_at&&new Date(share.expires_at)<=new Date())) return NextResponse.json({error:'Comments are disabled or this share has expired.'},{status:404});
 const auth=await getProfile(req).catch(()=>null);
 const {data:created,error:insertError}=await db.from('bram_preview_comments').insert({
  share_id:share.id,project_id:share.project_id,user_id:share.user_id,author_user_id:auth?.user.id||null,body:comment,
  anchor:body?.anchor&&typeof body.anchor==='object'&&!Array.isArray(body.anchor)?body.anchor:{},status:'open'
 }).select('id,body,status,created_at').single();
 if(insertError) return NextResponse.json({error:'Comment could not be saved.'},{status:503});
 let edit:{queued:boolean;reason?:string}={queued:false,reason:'Feedback is saved for the project owner to review.'};
 if(auth?.user.id===share.user_id&&body?.apply_to_bram===true){
  const sessionId=typeof body.session_id==='string'&&/^[0-9a-f-]{36}$/i.test(body.session_id)?body.session_id:'';
  if(sessionId){
   const response=await fetch(new URL('/api/chat',req.url),{method:'POST',headers:{
    'Content-Type':'application/json',...(req.headers.get('authorization')?{Authorization:req.headers.get('authorization')!}:{}),
    ...(req.headers.get('cookie')?{Cookie:req.headers.get('cookie')!}:{})},
    body:JSON.stringify({session_id:sessionId,project_id:share.project_id,request_type:'repair',
     message:'Apply this reviewer feedback to the existing project. Inspect the current saved workspace first, preserve existing features and structure, make the requested changes, and report actual results. Feedback: '+comment}),
    cache:'no-store',signal:AbortSignal.timeout(100000)});
   const result=await response.json().catch(()=>({}));
   if(response.ok){await db.from('bram_preview_comments').update({status:'queued',edit_request_id:sessionId,updated_at:new Date().toISOString()}).eq('id',created.id);edit={queued:true};}
   else edit={queued:false,reason:typeof result.error==='string'?result.error:'Bram could not accept this edit request.'};
  } else edit={queued:false,reason:'Sign in as the project owner and provide a Bram session to apply feedback.'};
 }
 return NextResponse.json({comment:created,edit},{status:201,headers:{'Cache-Control':'no-store'}});
}
