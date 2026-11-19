import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
export const runtime='nodejs';
type C={params:Promise<{token:string}>};
export async function GET(_req:NextRequest,{params}:C){
 const {token}=await params;if(!/^[A-Za-z0-9_-]{40,64}$/.test(token))return NextResponse.json({error:'Preview link is invalid or expired.'},{status:404});
 const hash=createHash('sha256').update(token).digest('hex');
 const {data,error}=await adminSupabase().from('bram_preview_shares').select('preview_url,expires_at,revoked_at').eq('token_hash',hash).maybeSingle();
 if(error)return NextResponse.json({error:'Preview sharing is temporarily unavailable.'},{status:503});
 if(!data||data.revoked_at||new Date(data.expires_at)<=new Date())return NextResponse.json({error:'Preview link is invalid or expired.'},{status:404});
 return NextResponse.json({preview_url:data.preview_url,expires_at:data.expires_at},{headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
}