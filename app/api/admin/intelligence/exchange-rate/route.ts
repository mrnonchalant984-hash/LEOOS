import { createHash } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { adminSupabase,requireOwner } from '@/lib/auth';
export const runtime='nodejs';
const COOKIE='leo_admin_device',hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const owner=await requireOwner(req);if(!owner||!owner.profile.twofa_verified)return NextResponse.json({error:'Owner 2FA required.'},{status:403});
 const token=req.cookies.get(COOKIE)?.value;if(!token)return NextResponse.json({error:'Trusted device required.'},{status:403});
 const {data:device,error:deviceError}=await adminSupabase().from('admin_trusted_devices').select('expires_at,user_agent_hash').eq('user_id',owner.user.id).eq('token_hash',hash(token)).maybeSingle();
 if(deviceError||!device||new Date(device.expires_at)<=new Date()||(device.user_agent_hash&&device.user_agent_hash!==hash(req.headers.get('user-agent')||'unknown')))return NextResponse.json({error:'Trusted device required.'},{status:403});
 const response=await fetch('https://open.er-api.com/v6/latest/USD',{cache:'no-store',signal:AbortSignal.timeout(8000)});
 const payload=await response.json().catch(()=>null);
 const rate=payload?.rates?.NGN;
 if(!response.ok||payload?.result!=='success'||!Number.isFinite(rate)||rate<=0)return NextResponse.json({error:'The exchange-rate provider did not return a valid USD/NGN rate.'},{status:503});
 const observed=typeof payload.time_last_update_utc==='string'?new Date(payload.time_last_update_utc):new Date();
 if(!Number.isFinite(observed.getTime()))return NextResponse.json({error:'The exchange-rate timestamp is invalid.'},{status:502});
 const db=adminSupabase();
 const {data,error}=await db.from('ai_exchange_rates').insert({rate:String(rate),source:'open.er-api.com',source_url:'https://www.exchangerate-api.com/docs/free',observed_at:observed.toISOString(),is_manual_override:false,created_by:owner.user.id}).select().single();
 if(error)return NextResponse.json({error:'Exchange-rate snapshot could not be saved.'},{status:503});
 await db.from('admin_logs').insert({user_id:owner.user.id,action:'usd_ngn_exchange_rate_snapshot:'+data.id});
 return NextResponse.json({rate:data.rate,source:data.source,observedAt:data.observed_at,saved:true},{headers:{'Cache-Control':'no-store'}});
}