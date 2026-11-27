import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getProfile, isPlatformOwner, adminSupabase } from '@/lib/auth';
import { runGeminiComputerUse } from '@/lib/agents/gemini-computer-use';
export const runtime='nodejs';
export const maxDuration=120;
const MAX_TASK=4000;
function domainsFrom(value:unknown,host:string){if(!Array.isArray(value)||value.length>20)return[host];const items=[...new Set(value.map(v=>String(v).trim().toLowerCase()).filter(Boolean))];return items.length?items:[host];}
function sign(value:string){const secret=process.env.BRAM_BROWSER_RUNTIME_TOKEN||'';if(!secret)throw Error('Browser runtime signing secret is missing.');return createHmac('sha256',secret).update(value).digest('hex');}
async function browserRequest(path:string,body?:unknown){const base=process.env.BRAM_BROWSER_RUNTIME_URL?.replace(/\/$/,'');const token=process.env.BRAM_BROWSER_RUNTIME_TOKEN;if(!base||!token)throw Error('The isolated browser runtime is not configured.');const response=await fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body||{}),cache:'no-store',signal:AbortSignal.timeout(25000)});const data=await response.json().catch(()=>({})) as any;if(!response.ok)throw Error(data.error||'Browser runtime returned HTTP '+response.status+'.');return data;}
export async function POST(req:NextRequest){
 const ctx=await getProfile(req);if(!ctx)return NextResponse.json({error:'Sign in required.'},{status:401});if(!isPlatformOwner(ctx.profile))return NextResponse.json({error:'Bram computer use is owner-only.'},{status:403});
 const body=await req.json().catch(()=>null),task=typeof body?.task==='string'?body.task.trim():'',rawUrl=typeof body?.url==='string'?body.url:'';
 if(!task||task.length>MAX_TASK)return NextResponse.json({error:'A task of 1–4,000 characters is required.'},{status:400});
 let url:URL;try{url=new URL(rawUrl);}catch{return NextResponse.json({error:'A valid starting URL is required.'},{status:400});}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hostname==='localhost'||url.hostname.endsWith('.local'))return NextResponse.json({error:'The starting URL is not permitted.'},{status:400});
 const domains=domainsFrom(body.allowedDomains,url.hostname),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),105000);let sessionId:string|undefined,keepSession=false;
 const bridge={
  async start(startUrl:string,allowed:string[]){const result=await browserRequest('/sessions',{url:startUrl,allowedDomains:allowed});sessionId=result.sessionId;return{sessionId:result.sessionId,state:{url:result.url,screenshot:result.screenshot}};},
  async action(id:string,action:unknown){const result=await browserRequest('/sessions/'+id+'/action',{action});return{url:result.url,title:result.title,screenshot:result.screenshot};},
  async close(id:string){await browserRequest('/sessions/'+id+'/close');},
 };
 try{
  const result=await runGeminiComputerUse({task,url:url.href,allowedDomains:domains,bridge,signal:controller.signal});
  let approvalToken:string|undefined;
  if(result.status==='waiting_approval'&&result.sessionId&&result.pendingAction){
   keepSession=true;
   const payload=JSON.stringify({userId:ctx.user.id,sessionId:result.sessionId,action:result.pendingAction,exp:Date.now()+5*60_000});
   approvalToken=Buffer.from(payload).toString('base64url')+'.'+sign(payload);
  }
  await adminSupabase().from('agent_execution_events').insert({user_id:ctx.user.id,agent_id:'bram',event_type:'computer_use',status:result.status,metadata:{steps:result.steps,url_host:url.hostname,summary:result.summary.slice(0,500)}}).then(()=>undefined).catch(()=>undefined);
  return NextResponse.json({...result,approvalToken},{status:result.status==='failed'?502:200,headers:{'cache-control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Computer use failed.'},{status:502});}
 finally{clearTimeout(timer);if(sessionId&&!keepSession)await bridge.close(sessionId).catch(()=>{});}
}
export async function PUT(req:NextRequest){
 const ctx=await getProfile(req);if(!ctx)return NextResponse.json({error:'Sign in required.'},{status:401});if(!isPlatformOwner(ctx.profile))return NextResponse.json({error:'Bram computer use is owner-only.'},{status:403});
 const body=await req.json().catch(()=>null),token=typeof body?.approvalToken==='string'?body.approvalToken:'',parts=token.split('.');
 if(parts.length!==2)return NextResponse.json({error:'A valid approval token is required.'},{status:400});
 let payload:string;try{payload=Buffer.from(parts[0],'base64url').toString('utf8');}catch{return NextResponse.json({error:'Invalid approval token.'},{status:400});}
 const expected=sign(payload),provided=parts[1];if(expected.length!==provided.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return NextResponse.json({error:'Approval token signature is invalid.'},{status:403});
 let approval:any;try{approval=JSON.parse(payload);}catch{return NextResponse.json({error:'Approval token is invalid.'},{status:400});}
 if(approval.userId!==ctx.user.id||!Number.isFinite(approval.exp)||approval.exp<Date.now())return NextResponse.json({error:'Approval token expired or belongs to another account.'},{status:403});
 try{const result=await browserRequest('/sessions/'+approval.sessionId+'/action',{action:approval.action,confirmed:true});await browserRequest('/sessions/'+approval.sessionId+'/close');return NextResponse.json({status:'approved_action_executed',url:result.url,title:result.title,screenshot:result.screenshot},{headers:{'cache-control':'no-store'}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Approved action failed.'},{status:502});}
}
