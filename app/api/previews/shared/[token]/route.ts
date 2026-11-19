import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
export const runtime='nodejs';
type Ctx={params:Promise<{token:string}>};
export async function GET(_req:NextRequest,{params}:Ctx){
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({error:'Share not found.'},{status:404});
 const hash=createHash('sha256').update(token).digest('hex');
 const db=adminSupabase();
 const {data:share,error}=await db.from('bram_preview_shares').select('id,project_id,title,preview_url,allow_comments,expires_at,status,created_at')
  .eq('share_token_hash',hash).eq('status','active').maybeSingle();
 if(error) return NextResponse.json({error:'Share service unavailable.'},{status:503});
 if(!share || (share.expires_at && new Date(share.expires_at)<=new Date())) return NextResponse.json({error:'This share link has expired or been revoked.'},{status:404});
 await db.from('bram_preview_shares').update({last_viewed_at:new Date().toISOString()}).eq('id',share.id).eq('status','active');
 const {data:comments,error:ce}=await db.from('bram_preview_comments').select('id,body,anchor,status,created_at')
  .eq('share_id',share.id).in('status',['open','queued','applied']).order('created_at',{ascending:true}).limit(100);
 if(ce) return NextResponse.json({error:'Preview comments are unavailable.'},{status:503});
 return NextResponse.json({share:{id:share.id,project_id:share.project_id,title:share.title,preview_url:share.preview_url,allow_comments:share.allow_comments,expires_at:share.expires_at},comments:comments||[]},
 {headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
