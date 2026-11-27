import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import crypto from 'node:crypto';
const COOKIE='leo_admin_device', PAGE_SIZE=1000, MAX_USAGE_ROWS=20000;
const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
type UsageRow={user_id:string;feature:string;model:string|null;prompt_tokens:number|null;completion_tokens:number|null;total_tokens:number|null;credits_used:number|null;metadata:Record<string,unknown>|null;created_at:string};
function aggregate(rows:UsageRow[]){
 const totalTokens=rows.reduce((n,r)=>n+Number(r.total_tokens||0),0),inputTokens=rows.reduce((n,r)=>n+Number(r.prompt_tokens||0),0),outputTokens=rows.reduce((n,r)=>n+Number(r.completion_tokens||0),0),totalCredits=rows.reduce((n,r)=>n+Number(r.credits_used||0),0);
 const map=new Map<string,{requests:number;tokens:number;credits:number}>();
 for(const r of rows){const k=r.feature||'unknown',v=map.get(k)||{requests:0,tokens:0,credits:0};v.requests++;v.tokens+=Number(r.total_tokens||0);v.credits+=Number(r.credits_used||0);map.set(k,v)}
 const inputRate=Number(process.env.AI_INPUT_USD_PER_1M_TOKENS||0),outputRate=Number(process.env.AI_OUTPUT_USD_PER_1M_TOKENS||0);
 return {totalTokens,inputTokens,outputTokens,totalCredits,requests:rows.length,estimatedCostUsd:(inputTokens/1e6)*inputRate+(outputTokens/1e6)*outputRate,byFeature:[...map.entries()].sort((a,b)=>b[1].tokens-a[1].tokens)};
}
export async function GET(req:NextRequest){
 const ctx=await requireOwner(req,{allowUntrustedForSetup:true});if(!ctx)return NextResponse.json({error:'Owner access required'},{status:403});if(!ctx.profile.twofa_verified)return NextResponse.json({error:'2FA setup required',setup:true},{status:403});
 const db=adminSupabase(),trusted=req.cookies.get(COOKIE)?.value;
 const device=trusted?await db.from('admin_trusted_devices').select('id,expires_at,user_agent_hash').eq('user_id',ctx.user.id).eq('token_hash',hash(trusted)).maybeSingle():{data:null};
 const agentHash=hash(req.headers.get('user-agent')||'unknown');
 if(!device.data||new Date(device.data.expires_at)<=new Date()||(device.data.user_agent_hash&&device.data.user_agent_hash!==agentHash))return NextResponse.json({error:'New or unrecognized device. Enter your authenticator code.',reauth:true},{status:403});
 await db.from('admin_trusted_devices').update({last_used_at:new Date().toISOString()}).eq('id',device.data.id);
 const now=new Date(),startDay=new Date(now),startWeek=new Date(now),startMonth=new Date(now.getFullYear(),now.getMonth(),1);startDay.setHours(0,0,0,0);startWeek.setDate(startWeek.getDate()-6);startWeek.setHours(0,0,0,0);
 const [users,payments,subs,projects,hosting]=await Promise.all([db.from('profiles').select('id,email,full_name,role,created_at'),db.from('payments').select('*').order('created_at',{ascending:false}).limit(100),db.from('subscriptions').select('*').order('created_at',{ascending:false}).limit(500),db.from('projects').select('*').order('created_at',{ascending:false}).limit(100),db.from('hosting_subscriptions').select('id,status,ends_at,client_email,website_project_id').order('ends_at',{ascending:true}).limit(500)]);
 for(const q of [users,payments,subs,projects,hosting])if(q.error)return NextResponse.json({error:'Admin dashboard data could not be loaded.'},{status:500});
 // ai_usage has no website_project_id. Paginate real columns to avoid a silent empty result and the 1,000-row default cap.
 const rows:UsageRow[]=[];
 for(let offset=0;offset<MAX_USAGE_ROWS;offset+=PAGE_SIZE){const q=await db.from('ai_usage').select('user_id,feature,model,prompt_tokens,completion_tokens,total_tokens,credits_used,metadata,created_at').order('created_at',{ascending:false}).range(offset,offset+PAGE_SIZE-1);if(q.error)return NextResponse.json({error:'AI usage analytics could not be loaded.'},{status:500});const batch=(q.data||[]) as UsageRow[];rows.push(...batch);if(batch.length<PAGE_SIZE)break}
 const usageTruncated=rows.length===MAX_USAGE_ROWS,profileMap=new Map((users.data||[]).map(u=>[u.id,u]));
 const userMap=new Map<string,{userId:string;email:string;fullName:string;requests:number;tokens:number;inputTokens:number;outputTokens:number;credits:number;lastUsedAt:string|null}>(),projectMap=new Map<string,{requests:number;tokens:number;credits:number}>(),dailyMap=new Map<string,{requests:number;tokens:number}>();
 for(const r of rows){const p=profileMap.get(r.user_id),u=userMap.get(r.user_id)||{userId:r.user_id,email:p?.email||'Account email unavailable',fullName:p?.full_name||'Unnamed account',requests:0,tokens:0,inputTokens:0,outputTokens:0,credits:0,lastUsedAt:null};u.requests++;u.tokens+=Number(r.total_tokens||0);u.inputTokens+=Number(r.prompt_tokens||0);u.outputTokens+=Number(r.completion_tokens||0);u.credits+=Number(r.credits_used||0);if(!u.lastUsedAt||new Date(r.created_at)>new Date(u.lastUsedAt))u.lastUsedAt=r.created_at;userMap.set(r.user_id,u);
 const pk=typeof r.metadata?.project_id==='string'?r.metadata.project_id:'unattributed',pv=projectMap.get(pk)||{requests:0,tokens:0,credits:0};pv.requests++;pv.tokens+=Number(r.total_tokens||0);pv.credits+=Number(r.credits_used||0);projectMap.set(pk,pv);
 const day=new Date(r.created_at).toISOString().slice(0,10),dv=dailyMap.get(day)||{requests:0,tokens:0};dv.requests++;dv.tokens+=Number(r.total_tokens||0);dailyMap.set(day,dv)}
 return NextResponse.json({users:users.data||[],payments:payments.data||[],subscriptions:subs.data||[],projects:projects.data||[],hosting:hosting.data||[],analytics:{all:aggregate(rows),today:aggregate(rows.filter(r=>new Date(r.created_at)>=startDay)),week:aggregate(rows.filter(r=>new Date(r.created_at)>=startWeek)),month:aggregate(rows.filter(r=>new Date(r.created_at)>=startMonth)),byUser:[...userMap.values()].sort((a,b)=>b.tokens-a.tokens),byProject:[...projectMap.entries()],daily:[...dailyMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-30),usageTruncated,usageRowsIncluded:rows.length},recentUsage:rows.slice(0,30)},{headers:{'Cache-Control':'private, no-store'}});
}
