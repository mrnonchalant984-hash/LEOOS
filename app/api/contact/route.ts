import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateContactSubmission } from '@/lib/contact-form';
import { enforceIpRateLimit } from '@/lib/rate-limit';

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

    // Email delivery is intentionally handled by the browser using Web3Forms.
    // Its free endpoint rejects server-originated requests unless the server IP
    // is allowlisted. Never silently fall back to Resend or SMTP.
    return NextResponse.json({
      ok: true,
      saved: true,
      emailSent: false,
      web3FormsClientRequired: true,
      notification: 'web3forms_client_delivery_required',
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      error: 'Contact submission could not be completed. Please try again.',
    }, { status: 503 });
  }
}
