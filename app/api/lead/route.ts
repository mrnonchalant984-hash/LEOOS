import {NextRequest,NextResponse} from 'next/server';
import {supabase} from '@/lib/supabase';
export const runtime='nodejs';

async function notifyByEmail(data:{name:string;service:string;budget:string;phone:string;chat_summary?:string}){
  const apiKey=process.env.RESEND_API_KEY;
  const destination=process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com';
  if(!apiKey) return false;
  const from=process.env.CONTACT_FROM_EMAIL || 'LEO Portfolio <onboarding@resend.dev>';
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
    from,to:[destination],subject:`🚨 New lead: ${data.name}`,text:`Hey Boss Leonard 👑\n\nLeo just received a new lead.\n\nName: ${data.name}\nService: ${data.service}\nBudget: ${data.budget}\nPhone: ${data.phone}\n${data.chat_summary?`\nChat summary: ${data.chat_summary}\n`:''}\nPlease follow up with the client.`,
  })});
  return r.ok;
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const name=String(body.name||'').trim();
    const service=String(body.service||'').trim();
    const budget=String(body.budget||'').trim();
    const phone=String(body.phone||body.whatsapp||'').trim();
    if(!name||!service||!budget||!phone)return NextResponse.json({error:'Please complete all lead fields.'},{status:400});
    if(supabase){const {error}=await supabase.from('leads').insert({name,service,budget,whatsapp:phone,chat_summary:body.chat_summary||''});if(error)throw error}
    const emailSent=await notifyByEmail({name,service,budget,phone,chat_summary:body.chat_summary});
    if(!emailSent)return NextResponse.json({error:'Lead saved, but email notification is not configured yet.'},{status:503});
    return NextResponse.json({ok:true,emailSent:true});
  }catch(e:any){return NextResponse.json({error:e.message||'Lead capture failed'},{status:500})}
}
