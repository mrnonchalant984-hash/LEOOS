import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enforceIpRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return NextResponse.json({ error: 'Send lead details as JSON.' }, { status: 415 });
    }
    const limited = await enforceIpRateLimit(req, 'public-lead', 5, 3600);
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Send a valid lead submission.' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    // Honeypot field: bots that fill it are rejected without storing or notifying.
    if (typeof input.website === 'string' && input.website.trim()) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const service = typeof input.service === 'string' ? input.service.trim() : '';
    const budget = typeof input.budget === 'string' ? input.budget.trim() : '';
    const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
    const chatSummary = typeof input.chat_summary === 'string' ? input.chat_summary.trim() : '';

    if (name.length < 2 || name.length > 120 || service.length < 2 || service.length > 500 ||
        budget.length < 1 || budget.length > 160 || phone.length < 5 || phone.length > 80 ||
        chatSummary.length > 4000) {
      return NextResponse.json({ error: 'Please complete the lead fields with valid details.' }, { status: 400 });
    }
    if (!supabase) {
      return NextResponse.json({ error: 'Lead storage is unavailable. Configure Supabase before accepting leads.' }, { status: 503 });
    }

    const { error } = await supabase.from('leads').insert({
      name, service, budget, whatsapp: phone, chat_summary: chatSummary,
    });
    if (error) {
      console.error('Lead could not be saved.');
      return NextResponse.json({ error: 'The lead could not be saved. Please retry.' }, { status: 503 });
    }

    // The browser sends the owner notification through Web3Forms. Do not use
    // Resend or SMTP: Web3Forms free submissions must originate in the browser.
    return NextResponse.json({
      ok: true,
      saved: true,
      emailSent: false,
      web3FormsClientRequired: true,
      notification: 'web3forms_client_delivery_required',
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Lead capture failed. Please retry.' }, { status: 400 });
  }
}
