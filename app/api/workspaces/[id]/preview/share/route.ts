import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({error:'Authentication required.'},{status:401});
  const {id} = await params;
  if (!uuid.test(id)) return NextResponse.json({error:'Invalid project.'},{status:400});
  const db = adminSupabase();
  const {data:project,error:pe} = await db.from('projects').select('id,project_name').eq('id',id).eq('user_id',auth.user.id).maybeSingle();
  if (pe) return NextResponse.json({error:'Project could not be verified.'},{status:503});
  if (!project) return NextResponse.json({error:'Project not found.'},{status:404});
  const {data:preview,error:ve} = await db.from('cloudflare_preview_jobs').select('deployment_url,status').eq('project_id',id).eq('user_id',auth.user.id).eq('status','deployed').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (ve) return NextResponse.json({error:'Preview status unavailable.'},{status:503});
  if (!preview?.deployment_url || !/^https:\/\//i.test(preview.deployment_url)) return NextResponse.json({error:'A verified deployed preview is required before sharing.'},{status:409});
  const body = await req.json().catch(()=>({})) as Record<string,unknown>;
  const title = typeof body.title==='string' ? body.title.trim().slice(0,180) : project.project_name;
  const expiresIn = typeof body.expires_in_hours==='number' ? Math.max(1,Math.min(720,Math.floor(body.expires_in_hours))) : 168;
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const {data,error} = await db.from('bram_preview_shares').insert({
    project_id:id,user_id:auth.user.id,share_token_hash:hash,preview_url:preview.deployment_url,
    title:title || 'Shared preview',expires_at:new Date(Date.now()+expiresIn*3600000).toISOString(),
  }).select('id,title,expires_at').single();
  if (error) return NextResponse.json({error:'Share link could not be created.'},{status:503});
  const url = new URL('/preview/shared/'+encodeURIComponent(token),req.nextUrl.origin).toString();
  return NextResponse.json({share:{id:data.id,title:data.title,url,expires_at:data.expires_at}},{status:201,headers:{'Cache-Control':'no-store'}});
}
