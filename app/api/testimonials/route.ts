import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, max-age=0' };
const testimonialFields = 'id,name,company,comment,created_at';

function text(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export async function GET() {
  if (!supabase) return NextResponse.json({ error: 'Testimonials are temporarily unavailable.' }, { status: 503, headers });

  const { data, error, count } = await supabase
    .from('testimonials')
    .select(testimonialFields, { count: 'exact' })
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Testimonials could not be loaded.' }, { status: 500, headers });
  return NextResponse.json({ testimonials: data || [], count: count ?? 0 }, { headers });
}

export async function POST(request: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Testimonials cannot be submitted right now. Please try again later.' }, { status: 503, headers });

  try {
    const body = await request.json();
    const name = text(body?.name, 80);
    const company = text(body?.company, 100);
    const comment = text(body?.comment, 1200);

    if (name.length < 2) return NextResponse.json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400, headers });
    if (!company || company.length > 100) return NextResponse.json({ error: 'Please enter a company or role (up to 100 characters).' }, { status: 400, headers });
    if (comment.length < 10) return NextResponse.json({ error: 'Your testimonial must be at least 10 characters.' }, { status: 400, headers });

    const { data: testimonial, error } = await supabase
      .from('testimonials')
      .insert({ name, company, comment, status: 'published' })
      .select(testimonialFields)
      .single();

    if (error || !testimonial) {
      return NextResponse.json({ error: 'Your testimonial could not be published. Please try again.' }, { status: 500, headers });
    }

    const { count } = await supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', 'published');
    return NextResponse.json({ ok: true, testimonial, count: count ?? null }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: 'Invalid submission. Check the fields and try again.' }, { status: 400, headers });
  }
}
