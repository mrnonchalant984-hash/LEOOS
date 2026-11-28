import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime='nodejs';
const COOKIE='leo_admin_device';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
async function authorize(req:NextRequest){const owner=await requireOwner(req);if(!owner||!owner.profile.twofa_verified)return null;const token=req.cookies.get(COOKIE)?.value;if(!token)return null;const db=adminSupabase();const {data,error}=await db.from('admin_trusted_devices').select('id,expires_at,user_agent_hash').eq('user_id',owner.user.id).eq('token_hash',hash(token)).maybeSingle();if(error||!data||new Date(data.expires_at)<=new Date()||(data.user_agent_hash&&data.user_agent_hash!==hash(req.headers.get('user-agent')||'unknown')))return null;return owner;}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const owner=await authorize(req);if(!owner)return NextResponse.json({error:'Owner 2FA and trusted device required.'},{status:403});
 const body=await req.json().catch(()=>null);if(!body||typeof body!=='object')return NextResponse.json({error:'Invalid expense payload.'},{status:400});
 const category=String(body.category||'other'),description=String(body.description||'').trim(),currency=String(body.currency||'NGN').toUpperCase(),amountText=String(body.amount||''),incurredAt=String(body.incurred_at||'');
 const categories=['ai','hosting','database','storage','infrastructure','domain','email','notifications','other'];
 if(!categories.includes(category)||description.length<1||description.length>500||!['NGN','USD'].includes(currency)||!/^\d+(?:\.\d{1,8})?$/.test(amountText)||Number(amountText)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(incurredAt))return NextResponse.json({error:'Check the expense category, description, currency, amount and date.'},{status:400});
 const db=adminSupabase();let amountNgn=amountText,fxRateId:string|null=null;
 if(currency==='USD'){
  const {data:fx,error}=await db.from('ai_exchange_rates').select('id,rate').eq('base_currency','USD').eq('quote_currency','NGN').lte('observed_at',incurredAt+'T23:59:59.999Z').order('observed_at',{ascending:false}).limit(1).maybeSingle();
  if(error||!fx)return NextResponse.json({error:'No saved USD/NGN exchange-rate snapshot exists for this expense date. Add a verified rate first.'},{status:422});
  fxRateId=fx.id;const [whole,fraction='']=amountText.split('.');const amountScaled=BigInt(whole)*100000000n+BigInt((fraction+'00000000').slice(0,8));const rateText=String(fx.rate);const [rateWhole,rateFraction='']=rateText.split('.');const rateScaled=BigInt(rateWhole)*10000000000n+BigInt((rateFraction+'0000000000').slice(0,10));const ngnScaled=(amountScaled*rateScaled)/10000000000n;amountNgn=(ngnScaled/100000000n).toString()+'.'+(ngnScaled%100000000n).toString().padStart(8,'0');
 }
 const {data,error}=await db.from('business_expenses').insert({category,description,amount:amountText,currency,amount_ngn:amountNgn,fx_rate_id:fxRateId,incurred_at:incurredAt,created_by:owner.user.id}).select('id,category,description,amount,currency,amount_ngn,incurred_at,created_at').single();
 if(error)return NextResponse.json({error:'Expense could not be saved.'},{status:503});
 await db.from('admin_logs').insert({user_id:owner.user.id,action:'business_expense_created:'+data.id});
 return NextResponse.json({expense:data},{headers:{'Cache-Control':'no-store'}});
}