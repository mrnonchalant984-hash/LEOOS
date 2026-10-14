import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendSmtpMail } from '@/lib/smtp';

export const runtime = 'nodejs';

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
    const destination = process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL;
    let emailSent = false;
    if (destination && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM) {
      try { emailSent = await sendSmtpMail({ to: destination, from: process.env.SMTP_FROM, subject: `New website contact: ${name}`, text: `New contact message\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message.slice(0, 12000)}` }); } catch { emailSent = false; }
    }
    return NextResponse.json({ ok: true, saved: Boolean(supabase), emailSent, notification: emailSent ? 'sent' : 'optional_email_not_configured_or_failed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contact submission failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
