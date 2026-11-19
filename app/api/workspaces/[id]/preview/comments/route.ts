import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime='nodejs';
type C={params:Promise<{id:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(req:NextRequest,{params}:C){
 const auth=await getProfile(req);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
 const {id}=await params;if(!UUID.test(id))return NextResponse.json({error:'Workspace ID is invalid.'},{status:400});
 const {data,error}=await adminSupabase().from('bram_preview_comments').select('id,session_id,body,anchor,status,created_at,updated_at').eq('project_id',id).eq('owner_user_id',auth.user.id).order('created_at',{ascending:true}).limit(200);
 if(error)return NextResponse.json({error:'Preview comments are unavailable. Apply the Bram collaboration migration.'},{status:503});
 return NextResponse.json({comments:data||[]},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest,{params}:C){
 const auth=await getProfile(req);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
 const {id}=await params;if(!UUID.test(id))return NextResponse.json({error:'Workspace ID is invalid.'},{status:400});
 const body=await req.json().catch(()=>null) as {body?:unknown;session_id?:unknown;anchor?:unknown}|null;
 const message=typeof body?.body==='string'?body.body.trim():'';
 if(!message||message.length>4000)return NextResponse.json({error:'Comment must contain between 1 and 4,000 characters.'},{status:400});
 const sessionId=typeof body?.session_id==='string'&&UUID.test(body.session_id)?body.session_id:null;
 const anchor=body?.anchor&&typeof body.anchor==='object'&&!Array.isArray(body.anchor)?body.anchor:{};
 const db=adminSupabase();const {data:project}=await db.from('projects').select('id').eq('id',id).eq('user_id',auth.user.id).maybeSingle();
 if(!project)return NextResponse.json({error:'Workspace not found.'},{status:404});
 const {data,error}=await db.from('bram_preview_comments').insert({project_id:id,owner_user_id:auth.user.id,session_id:sessionId,body:message,anchor}).select('id,session_id,body,anchor,status,created_at').single();
 if(error)return NextResponse.json({error:'Comment could not be saved. Apply the Bram collaboration migration.'},{status:503});
 return NextResponse.json({comment:data,handoff:'comment_saved_for_bram_context'},{status:201,headers:{'Cache-Control':'private, no-store'}});
}