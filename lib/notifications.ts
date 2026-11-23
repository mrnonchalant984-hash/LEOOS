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
  // Web3Forms calls this an Access Key. There is no separate Form ID; when
  // using the optional /submit/{FORM_ID} route, the Access Key is that ID.
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
  if (!accessKey || !input.to) return false;

  // Web3Forms requires an active paid plan and deployment egress-IP
  // allowlisting for server-side submissions. The free endpoint is client-side.
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      access_key: accessKey,
      from_name: 'Braverton Market',
      subject: input.subject.slice(0, 160),
      email: input.to,
      message: input.text.slice(0, 12000),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (response.status !== 200) return false;
  const result = await response.json().catch(() => null) as {
    success?: boolean;
    message?: string;
    body?: { message?: string };
  } | null;
  return result?.success === true;
}
