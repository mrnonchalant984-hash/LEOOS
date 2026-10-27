import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateContactSubmission } from '@/lib/contact-form';
import { enforceIpRateLimit } from '@/lib/rate-limit';
import { sendSmtpMail } from '@/lib/smtp';

export const runtime = 'nodejs';

async function readBoundedBody(request: NextRequest, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        body += decoder.decode();
        return body;
      }
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new Error('contact_body_too_large');
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function notifyContact(data: {
  name: string;
  email: string;
  service: string;
  message: string;
}): Promise<boolean> {
  const destination = process.env.CONTACT_EMAIL || process.env.OWNER_EMAIL;
  if (!destination) return false;
  const text = [
    'New LeonardX contact message',
    '',
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    `Service: ${data.service}`,
    '',
    'Message:',
    data.message,
  ].join('\n');

  const smtpConfigured = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM,
  );
  if (smtpConfigured) {
    try {
      if (await sendSmtpMail({
        to: destination,
        from: process.env.SMTP_FROM,
        subject: `New LeonardX contact: ${data.name}`,
        text,
      })) return true;
    } catch {
      console.error('Contact email SMTP delivery failed.');
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [destination],
        reply_to: data.email,
        subject: `New LeonardX contact: ${data.name}`,
        text,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error(`Contact email Resend delivery failed with status ${response.status}.`);
      return false;
    }
    return true;
  } catch {
    console.error('Contact email Resend delivery failed.');
    return false;
  }
}

async function notifyWeb3Forms(data: { name: string; email: string; service: string; message: string }) {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
  if (!accessKey) return { configured: false, sent: false, error: 'Web3Forms is not configured for this deployment.' };
  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        name: data.name,
        email: data.email,
        replyto: data.email,
        subject: `New LeonardX contact: ${data.service}`,
        from_name: 'LeonardX Contact Form',
        message: `Service requested: ${data.service}\n\n${data.message}`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success === true) return { configured: true, sent: true, error: null };
    return { configured: true, sent: false, error: response.status === 429 ? 'Web3Forms rate-limited this message.' : (typeof result.message === 'string' ? result.message : `Web3Forms rejected the message (HTTP ${response.status}).`) };
  } catch {
    return { configured: true, sent: false, error: 'Web3Forms could not be reached.' };
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return NextResponse.json({ error: 'Send the contact form as JSON.' }, { status: 415 });
    }
    if (Number(request.headers.get('content-length') || 0) > 16_384) {
      return NextResponse.json({ error: 'The contact message is too large.' }, { status: 413 });
    }
    if (!supabase) {
      return NextResponse.json({
        error: 'Contact submissions are unavailable. Configure Supabase before accepting messages.',
      }, { status: 503 });
    }

    const limited = await enforceIpRateLimit(request, 'public-contact', 5, 3600);
    if (limited) return limited;

    let body: unknown;
    try {
      body = JSON.parse(await readBoundedBody(request, 16_384));
    } catch (error) {
      if (error instanceof Error && error.message === 'contact_body_too_large') {
        return NextResponse.json({ error: 'The contact message is too large.' }, { status: 413 });
      }
      return NextResponse.json({ error: 'Send a valid contact form submission.' }, { status: 400 });
    }
    const validation = validateContactSubmission(body);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const { name, email, service, message } = validation.data;
    const { error: saveError } = await supabase.from('contacts').insert({
      name,
      email,
      phone: '',
      message: `Service requested: ${service}\n\n${message}`,
    });
    if (saveError) {
      console.error('Contact message could not be saved.');
      return NextResponse.json({
        error: 'Your message could not be saved. Please try again shortly.',
      }, { status: 503 });
    }

    const [emailSent, web3] = await Promise.all([
      notifyContact({ name, email, service, message }),
      notifyWeb3Forms({ name, email, service, message }),
    ]);
    return NextResponse.json({
      ok: true,
      saved: true,
      emailSent,
      web3FormsSent: web3.sent,
      web3FormsConfigured: web3.configured,
      web3FormsError: web3.error,
      notification: emailSent || web3.sent ? 'sent' : 'not_configured_or_failed',
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      error: 'Contact submission could not be completed. Please try again.',
    }, { status: 503 });
  }
}
