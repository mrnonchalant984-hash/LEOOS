import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

    return NextResponse.json({ ok: true, saved: Boolean(supabase) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contact submission failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
