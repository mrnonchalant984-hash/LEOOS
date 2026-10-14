import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
const updateSchema = z.object({ action_item_id: z.string().uuid(), status: z.enum(['approved','dismissed','task_created']), linked_run_id: z.string().uuid().optional() }).strict();
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action item update.' }, { status: 400 });
  const { id } = await params;
  const db = adminSupabase();
  if (parsed.data.linked_run_id) {
    const { data: run } = await db.from('agent_runs').select('id').eq('id', parsed.data.linked_run_id).eq('user_id', ctx.user.id).maybeSingle();
    if (!run) return NextResponse.json({ error: 'The linked task does not belong to your account.' }, { status: 403 });
  }
  const { data, error } = await db.from('workforce_meeting_action_items').update({ status: parsed.data.status, linked_run_id: parsed.data.linked_run_id || null, updated_at: new Date().toISOString() }).eq('id', parsed.data.action_item_id).eq('meeting_id', id).eq('user_id', ctx.user.id).select('id,status,linked_run_id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Action item could not be updated.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Action item not found.' }, { status: 404 });
  return NextResponse.json({ action_item: data });
}
