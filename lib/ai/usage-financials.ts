import 'server-only';
import { adminSupabase } from '@/lib/auth';

function scaled(value: string | number, digits: number): bigint {
  const raw=String(value);
  if(!/^\d+(?:\.\d+)?$/.test(raw)) return 0n;
  const [whole,fraction='']=raw.split('.');
  return BigInt(whole)*10n**BigInt(digits)+BigInt((fraction+'0'.repeat(digits)).slice(0,digits));
}
function decimal(value:bigint,digits:number){const base=10n**BigInt(digits);return (value/base).toString()+'.'+(value%base).toString().padStart(digits,'0');}

/** Snapshot verified commercial pricing and the latest saved FX rate after a successful AI usage row. Actual provider billing stays unknown unless provider-reported. */
export async function recordAiUsageFinancials(input:{
 aiUsageId:string;provider:string;model:string;inputTokens:number;outputTokens:number;cachedInputTokens?:number;
 serviceTier?:'free'|'paid'|'unknown';actualCostUsd?:string|null;actualCostConfirmedZero?:boolean;
}){
 if(!input.aiUsageId||!input.provider||!input.model)return {recorded:false,reason:'missing_usage_identity'};
 const db=adminSupabase(),now=new Date().toISOString();
 const [priceQ,fxQ]=await Promise.all([
  db.from('ai_model_pricing').select('id,input_usd_per_million,output_usd_per_million,cached_input_usd_per_million,effective_at')
   .eq('provider',input.provider).eq('model',input.model).eq('service_tier','paid').eq('active',true).lte('effective_at',now)
   .or('effective_until.is.null,effective_until.gt.'+now).order('effective_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('ai_exchange_rates').select('id,rate').eq('base_currency','USD').eq('quote_currency','NGN').lte('observed_at',now).order('observed_at',{ascending:false}).limit(1).maybeSingle(),
 ]);
 const cached=Math.max(0,Math.min(Math.trunc(input.cachedInputTokens||0),Math.trunc(input.inputTokens||0)));
 const normal=Math.max(0,Math.trunc(input.inputTokens||0))-cached,output=Math.max(0,Math.trunc(input.outputTokens||0));
 let estimatedUsd:string|null=null,estimatedNgn:string|null=null,pricingId:string|null=null,fxId:string|null=null,fxRate:string|null=null;
 if(priceQ.data&&!priceQ.error){
  const inputRate=scaled(priceQ.data.input_usd_per_million,12),outputRate=scaled(priceQ.data.output_usd_per_million,12);
  const cachedRate=priceQ.data.cached_input_usd_per_million==null?inputRate:scaled(priceQ.data.cached_input_usd_per_million,12);
  const cost=(BigInt(normal)*inputRate+BigInt(output)*outputRate+BigInt(cached)*cachedRate)/1000000n;
  estimatedUsd=decimal(cost,12);pricingId=priceQ.data.id;
  if(fxQ.data&&!fxQ.error){const fx=scaled(fxQ.data.rate,10);const ngn=(cost*fx)/100000000000000n;estimatedNgn=decimal(ngn,8);fxId=fxQ.data.id;fxRate=String(fxQ.data.rate);}
 }
 const actualStatus=input.actualCostConfirmedZero?'zero_confirmed':input.actualCostUsd!=null?'provider_reported':'not_reported';
 const actualUsd=input.actualCostConfirmedZero?'0':input.actualCostUsd??null;
 let actualNgn:string|null=null;
 if(actualUsd!==null&&fxQ.data&&!fxQ.error){actualNgn=decimal((scaled(actualUsd,12)*scaled(fxQ.data.rate,10))/100000000000000n,8);}
 const {error}=await db.from('ai_usage_financials').upsert({
  ai_usage_id:input.aiUsageId,provider:input.provider,model:input.model,service_tier:input.serviceTier||'unknown',
  input_tokens:Math.max(0,Math.trunc(input.inputTokens||0)),output_tokens:output,cached_input_tokens:cached,
  pricing_id:pricingId,input_usd_per_million:priceQ.data?.input_usd_per_million??null,
  output_usd_per_million:priceQ.data?.output_usd_per_million??null,
  cached_input_usd_per_million:priceQ.data?.cached_input_usd_per_million??null,
  estimated_usd:estimatedUsd,actual_usd:actualUsd,fx_rate_id:fxId,usd_ngn_rate:fxRate,
  estimated_ngn:estimatedNgn,actual_ngn:actualNgn,pricing_status:estimatedUsd===null?'unpriced':'priced',
  actual_cost_status:actualStatus,
 },{onConflict:'ai_usage_id',ignoreDuplicates:true});
 if(error)return {recorded:false,reason:'financial_snapshot_write_failed'};
 return {recorded:true,priced:estimatedUsd!==null,fxCaptured:fxId!==null,actualCostStatus:actualStatus};
}
