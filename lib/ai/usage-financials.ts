import 'server-only';
import { adminSupabase } from '@/lib/auth';
function scaled(value:string|number,digits:number):bigint{const raw=String(value);if(!/^\d+(?:\.\d+)?$/.test(raw))return BigInt(0);const [whole,fraction='']=raw.split('.');return BigInt(whole)*1BigInt(0)**BigInt(digits)+BigInt((fraction+'0'.repeat(digits)).slice(0,digits));}
function decimal(value:bigint,digits:number){const base=1BigInt(0)**BigInt(digits);return (value/base).toString()+'.'+(value%base).toString().padStart(digits,'0');}
/** Persist a per-request commercial value snapshot. Actual provider billing is never inferred from token counts. */
async function recordAiUsageFinancialsInternal(input:{aiUsageId:string;provider:string;model:string;inputTokens:number;outputTokens:number;cachedInputTokens?:number;serviceTier?:'free'|'paid'|'unknown';actualCostUsd?:string|null;actualCostConfirmedZero?:boolean;at?:string}){
 if(!input.aiUsageId||!input.provider||!input.model)return {recorded:false,reason:'missing_usage_identity'};
 const db=adminSupabase(),now=input.at||new Date().toISOString();
 const [priceQ,fxQ,existingQ]=await Promise.all([
  db.from('ai_model_pricing').select('id,input_usd_per_million,output_usd_per_million,cached_input_usd_per_million').eq('provider',input.provider).eq('model',input.model).eq('service_tier','paid').eq('active',true).lte('effective_at',now).or('effective_until.is.null,effective_until.gt.'+now).order('effective_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('ai_exchange_rates').select('id,rate').eq('base_currency','USD').eq('quote_currency','NGN').lte('observed_at',now).order('observed_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('ai_usage_financials').select('*').eq('ai_usage_id',input.aiUsageId).maybeSingle(),
 ]);
 const old=existingQ.data;
 const cached=Math.max(0,Math.min(Math.trunc(input.cachedInputTokens||0),Math.trunc(input.inputTokens||0)));
 const normal=Math.max(0,Math.trunc(input.inputTokens||0))-cached,output=Math.max(0,Math.trunc(input.outputTokens||0));
 let estimatedUsd:string|null=old?.estimated_usd??null,estimatedNgn:string|null=old?.estimated_ngn??null,pricingId:string|null=old?.pricing_id??null;
 let inputPrice=old?.input_usd_per_million??null,outputPrice=old?.output_usd_per_million??null,cachedPrice=old?.cached_input_usd_per_million??null;
 let fxId:string|null=old?.fx_rate_id??null,fxRate:string|null=old?.usd_ngn_rate??null;
 if(priceQ.data&&!priceQ.error){
  const ir=scaled(priceQ.data.input_usd_per_million,12),or=scaled(priceQ.data.output_usd_per_million,12),cr=priceQ.data.cached_input_usd_per_million==null?ir:scaled(priceQ.data.cached_input_usd_per_million,12);
  const cost=(BigInt(normal)*ir+BigInt(output)*or+BigInt(cached)*cr)/100000BigInt(0);
  estimatedUsd=decimal(cost,12);pricingId=priceQ.data.id;inputPrice=priceQ.data.input_usd_per_million;outputPrice=priceQ.data.output_usd_per_million;cachedPrice=priceQ.data.cached_input_usd_per_million;
  if(fxQ.data&&!fxQ.error){const fx=scaled(fxQ.data.rate,10);estimatedNgn=decimal((cost*fx)/10000000000000BigInt(0),8);fxId=fxQ.data.id;fxRate=String(fxQ.data.rate);}
 }
 const actualStatus=input.actualCostConfirmedZero?'zero_confirmed':input.actualCostUsd!=null?'provider_reported':old?.actual_cost_status||'not_reported';
 const actualUsd=input.actualCostConfirmedZero?'0':input.actualCostUsd??old?.actual_usd??null;
 let actualNgn:string|null=old?.actual_ngn??null;
 if(actualUsd!==null&&fxQ.data&&!fxQ.error)actualNgn=decimal((scaled(actualUsd,12)*scaled(fxQ.data.rate,10))/10000000000000BigInt(0),8);
 const payload={ai_usage_id:input.aiUsageId,provider:input.provider,model:input.model,service_tier:input.serviceTier||old?.service_tier||'unknown',input_tokens:Math.max(0,Math.trunc(input.inputTokens||0)),output_tokens:output,cached_input_tokens:cached,pricing_id:pricingId,input_usd_per_million:inputPrice,output_usd_per_million:outputPrice,cached_input_usd_per_million:cachedPrice,estimated_usd:estimatedUsd,actual_usd:actualUsd,fx_rate_id:fxId,usd_ngn_rate:fxRate,estimated_ngn:estimatedNgn,actual_ngn:actualNgn,pricing_status:estimatedUsd===null?'unpriced':'priced',actual_cost_status:actualStatus};
 const write=await db.from('ai_usage_financials').upsert(payload,{onConflict:'ai_usage_id'});
 if(write.error)return {recorded:false,reason:'financial_snapshot_write_failed'};
 return {recorded:true,priced:estimatedUsd!==null,fxCaptured:fxId!==null,actualCostStatus:actualStatus};
}

export async function recordAiUsageFinancials(input: Parameters<typeof recordAiUsageFinancialsInternal>[0]) {
  try {
    return await recordAiUsageFinancialsInternal(input);
  } catch {
    // Financial telemetry must never turn a successful AI response into a failed request.
    return { recorded: false, reason: 'financial_snapshot_unavailable' };
  }
}
