import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime='nodejs';
type C={params:Promise<{id:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(req:NextRequest,{params}:C){
 const auth=await getProfile(req);if(!auth)return NextResponse.json({error:'Authentication required.'},{status:401});
 const {id}=await params;if(!UUID.test(id))return NextResponse.json({error:'Workspace ID is invalid.'},{status:400});
 const body=await req.json().catch(()=>({})) as {expires_in_hours?:unknown};
 const hours=typeof body.expires_in_hours==='number'&&Number.isInteger(body.expires_in_hours)?Math.max(1,Math.min(168,body.expires_in_hours)):72;
 const db=adminSupabase();
 const [{data:project},{data:preview,error:previewError}]=await Promise.all([
  db.from('projects').select('id').eq('id',id).eq('user_id',auth.user.id).maybeSingle(),
  db.from('cloudflare_preview_jobs').select('status,deployment_url').eq('project_id',id).eq('user_id',auth.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 if(!project)return NextResponse.json({error:'Workspace not found.'},{status:404});
 if(previewError)return NextResponse.json({error:'Preview state could not be checked.'},{status:503});
 if(!preview||preview.status!=='deployed'||typeof preview.deployment_url!=='string'||!preview.deployment_url.startsWith('https://'))return NextResponse.json({error:'A completed HTTPS preview is required before sharing.'},{status:409});
 const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+hours*3600000).toISOString();
 const {error}=await db.from('bram_preview_shares').insert({project_id:id,owner_user_id:auth.user.id,token_hash:createHash('sha256').update(token).digest('hex'),preview_url:preview.deployment_url,expires_at:expiresAt});
 if(error)return NextResponse.json({error:'Preview sharing is unavailable. Apply the Bram collaboration migration.'},{status:503});
 return NextResponse.json({share_url:new URL(`/preview/shared/${token}`,req.nextUrl.origin).toString(),expires_at:expiresAt},{status:201,headers:{'Cache-Control':'no-store'}});
}