import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import crypto from 'node:crypto';
const COOKIE='leo_admin_device';
const hash=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');

function aggregate(rows: any[]) {
  const totalTokens = rows.reduce((n,r)=>n+Number(r.total_tokens||0),0);
  const totalCredits = rows.reduce((n,r)=>n+Number(r.credits_used||0),0);
  const inputTokens = rows.reduce((n,r)=>n+Number(r.prompt_tokens||0),0);
  const outputTokens = rows.reduce((n,r)=>n+Number(r.completion_tokens||0),0);
  const byFeature = Object.entries(rows.reduce((a,r)=>{const k=String(r.feature||'unknown');a[k]??={requests:0,tokens:0,credits:0};a[k].requests++;a[k].tokens+=Number(r.total_tokens||0);a[k].credits+=Number(r.credits_used||0);return a},{} as Record<string,{requests:number;tokens:number;credits:number}>));
  const inputRate=Number(process.env.AI_INPUT_USD_PER_1M_TOKENS||0), outputRate=Number(process.env.AI_OUTPUT_USD_PER_1M_TOKENS||0);
  const estimatedCostUsd=(inputTokens/1_000_000)*inputRate+(outputTokens/1_000_000)*outputRate;
  return {totalTokens,totalCredits,inputTokens,outputTokens,requests:rows.length,estimatedCostUsd,byFeature};
}
export async function GET(req:NextRequest){
  const ctx=await requireOwner(req);if(!ctx)return NextResponse.json({error:'Owner access required'},{status:403});if(!ctx.profile.twofa_verified)return NextResponse.json({error:'2FA setup required',setup:true},{status:403});
  const db=adminSupabase();
  const trusted=req.cookies.get(COOKIE)?.value;
  if(!trusted){return NextResponse.json({error:'New or unrecognized device. Enter your authenticator code.',reauth:true},{status:403});}
  const {data:device}=await db.from('admin_trusted_devices').select('id,expires_at').eq('user_id',ctx.user.id).eq('token_hash',hash(trusted)).maybeSingle();
  if(!device || new Date(device.expires_at)<=new Date()) return NextResponse.json({error:'Trusted device expired or is not recognized.',reauth:true},{status:403});
  await db.from('admin_trusted_devices').update({last_used_at:new Date().toISOString()}).eq('id',device.id); const now=new Date();
  const startDay=new Date(now);startDay.setHours(0,0,0,0); const startWeek=new Date(now);startWeek.setDate(startWeek.getDate()-6);startWeek.setHours(0,0,0,0); const startMonth=new Date(now.getFullYear(),now.getMonth(),1);
  const [users,payments,subs,projects,usage,recentUsage,hosting]=await Promise.all([
    db.from('profiles').select('id,email,full_name,role,created_at'),db.from('payments').select('*').order('created_at',{ascending:false}).limit(100),db.from('subscriptions').select('*').order('created_at',{ascending:false}),db.from('projects').select('*').order('created_at',{ascending:false}).limit(20),db.from('ai_usage').select('total_tokens,prompt_tokens,completion_tokens,credits_used,feature,created_at,user_id,model,website_project_id').order('created_at',{ascending:false}),db.from('ai_usage').select('total_tokens,prompt_tokens,completion_tokens,credits_used,feature,created_at,user_id,model,website_project_id').order('created_at',{ascending:false}).limit(30),db.from('hosting_subscriptions').select('id,status,ends_at,client_email,website_project_id').order('ends_at',{ascending:true})
  ]);
  const rows=usage.data||[]; const byUser=Object.entries(rows.reduce((a,r)=>{const k=String(r.user_id);a[k]??={requests:0,tokens:0,credits:0};a[k].requests++;a[k].tokens+=Number(r.total_tokens||0);a[k].credits+=Number(r.credits_used||0);return a},{} as Record<string,{requests:number;tokens:number;credits:number}>));
  const byProject=Object.entries(rows.reduce((a,r)=>{const k=String(r.website_project_id||'leo');a[k]??={requests:0,tokens:0,credits:0};a[k].requests++;a[k].tokens+=Number(r.total_tokens||0);a[k].credits+=Number(r.credits_used||0);return a},{} as Record<string,{requests:number;tokens:number;credits:number}>));
  return NextResponse.json({users:users.data||[],payments:payments.data||[],subscriptions:subs.data||[],projects:projects.data||[],hosting:hosting.data||[],analytics:{all:aggregate(rows),today:aggregate(rows.filter(r=>new Date(r.created_at)>=startDay)),week:aggregate(rows.filter(r=>new Date(r.created_at)>=startWeek)),month:aggregate(rows.filter(r=>new Date(r.created_at)>=startMonth)),byUser,byProject},recentUsage:recentUsage.data||[]});
}
