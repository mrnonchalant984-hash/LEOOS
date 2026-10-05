import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

// Sends the contact message through Web3Forms without exposing its access key to the browser.
async function sendEmail(data: { name: string; email: string; phone: string; message: string }) {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!accessKey) return { sent: false, reason: 'missing_key' as const };
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: accessKey,
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      subject: `New portfolio lead from ${data.name}`,
      from_name: 'LEO OS Contact Form',
      replyto: data.email,
    }),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
  if (response.ok && result?.success) return { sent: true as const };
  return { sent: false as const, status: response.status, detail: result?.message || 'Web3Forms did not accept the submission.' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const message = String(body.message || '').trim();
    if (!name || !email || !phone || !message) {
      return NextResponse.json({ error: 'Name, email, phone and message are required.' }, { status: 400 });
    }

    if (supabase) {
      const { error } = await supabase.from('contacts').insert({ name, email, phone, message });
      if (error) throw error;
    }

    const emailResult = await sendEmail({ name, email, phone, message });
    if (!emailResult.sent) {
      if (emailResult.reason === 'missing_key') {
        return NextResponse.json({ error: 'Message saved, but contact delivery is not configured: WEB3FORMS_ACCESS_KEY is missing.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Message saved, but Web3Forms rejected the submission (HTTP ${emailResult.status}): ${emailResult.detail}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contact submission failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
