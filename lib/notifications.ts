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
  const apiKey = process.env.WEB3FORMS_API_KEY;
  const formId = process.env.WEB3FORMS_FORM_ID;
  if (!apiKey || !formId || !input.to) return false;

  // Web3Forms' server-side Submissions API. Recipient delivery requires the
  // form's autoresponder to be enabled for the submitted email address.
  const response = await fetch('https://api.web3forms.com/v1/submissions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      form_id: formId,
      from_name: 'Braverton Market',
      subject: input.subject.slice(0, 160),
      fields: {
        email: input.to,
        subject: input.subject.slice(0, 160),
        message: input.text.slice(0, 12000),
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) return false;
  const result = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { id?: string; form_id?: string };
    error?: { code?: string; message?: string };
  } | null;

  // The Web3Forms Submissions API returns 201 Created with data.id.
  // The legacy /submit endpoint returns { success: true }; accept either
  // response shape, but never treat an empty or malformed response as sent.
  return result?.success === true || (response.status === 201 && typeof result?.data?.id === 'string' && result.data.id.length > 0);
}
