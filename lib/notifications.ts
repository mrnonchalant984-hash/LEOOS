export async function sendOwnerWhatsApp(text: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to = process.env.WHATSAPP_ADMIN_TO;
  if (!token || !phoneId || !to) return false;
  const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:text}})
  });
  return r.ok;
}

export async function sendClientEmail(input:{to:string; subject:string; text:string; html?:string}) {
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.CONTACT_FROM_EMAIL;
  if(!apiKey || !from || !input.to) return false;
  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[input.to],subject:input.subject,text:input.text,html:input.html})
  });
  return r.ok;
}
