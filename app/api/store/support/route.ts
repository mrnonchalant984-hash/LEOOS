import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to view support requests.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('marketplace_support_tickets').select('id,subject,message,status,staff_reply,created_at,updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  return error ? NextResponse.json({ error: 'Support requests are unavailable.' }, { status: 503 }) : NextResponse.json({ tickets: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to contact support.' }, { status: 401 });
  const limited = await enforceUserRateLimit(user.id, 'store-support-ticket', 5, 3600); if (limited) return limited;
  const body = await request.json().catch(() => null) as { subject?: unknown; message?: unknown } | null;
  if (typeof body?.subject !== 'string' || body.subject.trim().length < 3 || body.subject.length > 160 || typeof body.message !== 'string' || body.message.trim().length < 10 || body.message.length > 5000) return NextResponse.json({ error: 'Enter a subject and a message of 10 to 5,000 characters.' }, { status: 400 });
  const { data, error } = await adminSupabase().from('marketplace_support_tickets').insert({ user_id: user.id, subject: body.subject.trim(), message: body.message.trim() }).select('id,status,created_at').single();
  return error ? NextResponse.json({ error: 'Support request could not be created.' }, { status: 503 }) : NextResponse.json({ ticket: data }, { status: 201 });
}
