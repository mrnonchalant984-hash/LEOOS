import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
const patchSchema = z.object({ status: z.enum(['scheduled','paused','cancelled']) }).strict();
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const { id } = await params;
  const db = adminSupabase();
  const { data: meeting, error } = await db.from('workforce_meetings').select('*').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Meeting storage is unavailable. Apply the included migration.' }, { status: 503 });
  if (!meeting) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
  const [messages, actions] = await Promise.all([
    db.from('workforce_meeting_messages').select('id,speaker_id,speaker_name,speaker_role,message,message_type,turn_index,created_at').eq('meeting_id', id).eq('user_id', ctx.user.id).order('turn_index').order('created_at'),
    db.from('workforce_meeting_action_items').select('id,title,description,suggested_role_id,priority,status,linked_run_id,created_at').eq('meeting_id', id).eq('user_id', ctx.user.id).order('created_at'),
  ]);
  if (messages.error || actions.error) return NextResponse.json({ error: 'Meeting transcript or action items could not be loaded.' }, { status: 503 });
  return NextResponse.json({ meeting, messages: messages.data || [], action_items: actions.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid meeting status.' }, { status: 400 });
  const { id } = await params;
  const { data, error } = await adminSupabase().from('workforce_meetings').update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', ctx.user.id).select('id,status,updated_at').maybeSingle();
  if (error) return NextResponse.json({ error: 'Meeting status could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
  return NextResponse.json({ meeting: data });
}
