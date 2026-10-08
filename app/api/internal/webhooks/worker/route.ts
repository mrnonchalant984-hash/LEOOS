import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { adminSupabase } from '@/lib/auth';
import { decryptSecret, isSafeWebhookUrl } from '@/lib/api-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || !secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = adminSupabase();
  const now = new Date().toISOString();
  const { data: jobs } = await db.from('webhook_deliveries').select('id,webhook_id,event_type,attempt').in('status',['queued','retrying']).or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order('created_at',{ascending:true}).limit(25);
  let processed = 0;
  for (const job of jobs || []) {
    const { data: webhook } = await db.from('webhooks').select('id,endpoint_url,secret_encrypted,active').eq('id',job.webhook_id).maybeSingle();
    if (!webhook || !webhook.active || !webhook.secret_encrypted || !isSafeWebhookUrl(webhook.endpoint_url)) { await db.from('webhook_deliveries').update({status:'failed',last_error:'Webhook is inactive, misconfigured or secret is unavailable'}).eq('id',job.id); continue; }
    const { data: event } = await db.from('webhook_events').select('id,event_type,payload,created_at').eq('event_type',job.event_type).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (!event) { await db.from('webhook_deliveries').update({status:'failed',last_error:'Event payload unavailable'}).eq('id',job.id); continue; }
    try {
      const signingSecret = decryptSecret(webhook.secret_encrypted);
      const timestamp = Math.floor(Date.now()/1000).toString();
      const payload = JSON.stringify({ id:event.id, type:event.event_type, created_at:event.created_at, data:event.payload });
      const signature = createHmac('sha256',signingSecret).update(`${timestamp}.${payload}`).digest('hex');
      const response = await fetch(webhook.endpoint_url,{method:'POST',redirect:'error',headers:{'content-type':'application/json','user-agent':'LEO-OS-Webhooks/2.0','x-leo-event':event.event_type,'x-leo-timestamp':timestamp,'x-leo-signature':`v1=${signature}`},body:payload,signal:AbortSignal.timeout(10000)});
      const responseBody=(await response.text()).slice(0,4000);
      const attempt=(job.attempt||0)+1;
      if(response.ok){await db.from('webhook_deliveries').update({status:'delivered',attempt,response_code:response.status,response_body:responseBody,delivered_at:new Date().toISOString(),next_attempt_at:null,last_error:null}).eq('id',job.id);} else {const retry=attempt<5;await db.from('webhook_deliveries').update({status:retry?'retrying':'failed',attempt,response_code:response.status,response_body:responseBody,next_attempt_at:retry?new Date(Date.now()+Math.min(3600000,2**attempt*30000)).toISOString():null,last_error:`HTTP ${response.status}`}).eq('id',job.id);}
    } catch(e){const attempt=(job.attempt||0)+1;const retry=attempt<5;await db.from('webhook_deliveries').update({status:retry?'retrying':'failed',attempt,next_attempt_at:retry?new Date(Date.now()+Math.min(3600000,2**attempt*30000)).toISOString():null,last_error:e instanceof Error?e.message.slice(0,1000):'Delivery failed'}).eq('id',job.id);}
    processed++;
  }
  return NextResponse.json({processed});
}
