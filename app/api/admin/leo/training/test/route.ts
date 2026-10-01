import {NextRequest,NextResponse} from 'next/server';import {requireOwner,adminSupabase} from '@/lib/auth';import {getOpenAI} from '@/lib/openai';import {formatKnowledgeContext,retrieveLeoKnowledge} from '@/lib/leo-knowledge';export const runtime='nodejs';
export async function POST(req:NextRequest){
 const c=await requireOwner(req);if(!c||!c.profile.twofa_verified)return NextResponse.json({error:'Owner 2FA access required'},{status:403});
 try{
  const b=await req.json();const q=String(b.message||'');if(!q)return NextResponse.json({error:'Message required.'},{status:400});
  const rows=await retrieveLeoKnowledge(q,8);const {data:inst}=await adminSupabase().from('leo_system_instructions').select('content').eq('active',true).order('priority',{ascending:true}).limit(10);
  const system=`You are Leo, the general AI assistant inside LEO OS. Test persistent knowledge without pretending it is model knowledge. Never claim actions you did not perform. Prefer verified/current sources when available.${(inst||[]).map((x:any)=>`\n${x.content}`).join('')}${formatKnowledgeContext(rows)}`;
  const r=await getOpenAI().chat.completions.create({model:'gpt-4o-mini',messages:[{role:'system',content:system},{role:'user',content:q}],temperature:.3,max_tokens:1000});
  return NextResponse.json({reply:r.choices[0]?.message?.content||'',sources:rows.map(x=>({id:x.id,title:x.title,category:x.category,source_type:x.source_type}))});
 }catch(error){
  const apiError=error as {status?:number;code?:string;message?:string};
  const quotaError=apiError.status===429||apiError.code==='insufficient_quota'||apiError.code==='credit_balance_exhausted';
  const message=quotaError?'OpenAI API credits are exhausted. Add billing credits to the API account configured by OPENAI_API_KEY, then retry.':apiError.message||'Leo training test failed.';
  return NextResponse.json({error:message},{status:quotaError?503:500});
 }
}
