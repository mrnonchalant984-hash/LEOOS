import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendSmtpMail } from '@/lib/smtp';

export const runtime = 'nodejs';

type LeadPayload = { name: string; service: string; budget: string; phone: string; chat_summary?: string };

async function notifyByEmail(data: LeadPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const destination = process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL;
  // Email notification is optional; the lead is stored independently below.
  if (!destination) return false;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM) {
    try { return await sendSmtpMail({ to: destination, from: process.env.SMTP_FROM, subject: `New lead: ${data.name}`, text: `New LeonardX lead\n\nName: ${data.name}\nService: ${data.service}\nBudget: ${data.budget}\nPhone: ${data.phone}${data.chat_summary ? `\n\nChat summary: ${data.chat_summary}` : ''}\n\nFollow up with the client.` }); } catch { return false; }
  }
  if (!apiKey) return false;
  const from = process.env.CONTACT_FROM_EMAIL || 'LeonardX <onboarding@resend.dev>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [destination],
        subject: `New lead: ${data.name}`,
        text: `New LeonardX lead\n\nName: ${data.name}\nService: ${data.service}\nBudget: ${data.budget}\nPhone: ${data.phone}${data.chat_summary ? `\n\nChat summary: ${data.chat_summary}` : ''}\n\nFollow up with the client.`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim().slice(0, 160);
    const service = String(body.service || '').trim().slice(0, 500);
    const budget = String(body.budget || '').trim().slice(0, 160);
    const phone = String(body.phone || body.whatsapp || '').trim().slice(0, 80);
    const chatSummary = typeof body.chat_summary === 'string' ? body.chat_summary.trim().slice(0, 4000) : '';
    if (!name || !service || !budget || !phone) {
      return NextResponse.json({ error: 'Please complete all lead fields.' }, { status: 400 });
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Lead storage is unavailable. Configure Supabase before accepting leads.' }, { status: 503 });
    }
    const { error } = await supabase.from('leads').insert({ name, service, budget, whatsapp: phone, chat_summary: chatSummary });
    if (error) {
      return NextResponse.json({ error: 'The lead could not be saved. Please retry.' }, { status: 503 });
    }

    const emailSent = await notifyByEmail({ name, service, budget, phone, chat_summary: chatSummary });
    return NextResponse.json({ ok: true, saved: true, emailSent, notification: emailSent ? 'sent' : 'optional_email_not_configured' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Lead capture failed. Please retry.' }, { status: 400 });
  }
}
