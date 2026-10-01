import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

// Sends the contact message to Leonard through Resend's server-side HTTP API.
async function sendEmail(data: { name: string; email: string; phone: string; message: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const destination = process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL || 'leonardudoh5@gmail.com';
  if (!apiKey) return { sent: false, reason: 'missing_key' as const };
  const from = process.env.CONTACT_FROM_EMAIL || 'LEO Portfolio <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [destination], reply_to: data.email,
      subject: `🔔 New portfolio lead from ${data.name}`,
      text: `Hey Boss Leonard 👑\n\nYou just received a new portfolio contact.\n\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}\n\nMessage:\n${data.message}`,
    }),
  });
  if (response.ok) return { sent: true as const };
  const result = await response.json().catch(() => null) as { message?: string; name?: string } | null;
  return { sent: false as const, status: response.status, detail: result?.message || result?.name || 'No additional details returned.' };
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
        return NextResponse.json({ error: 'Message saved, but email delivery is unavailable: RESEND_API_KEY is missing.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Message saved, but Resend rejected the email (HTTP ${emailResult.status}): ${emailResult.detail}. Check that the API key is active and the sender domain is verified in Resend.` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contact submission failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
