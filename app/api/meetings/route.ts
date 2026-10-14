import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { canUseManualAgents } from '@/lib/agents/entitlements';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';
import { getConfiguredModel } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const roleIds = new Set(PROFESSIONAL_ROLES.map(role => role.id));
const meetingSchema = z.object({
  title: z.string().trim().min(2).max(160),
  objective: z.string().trim().min(5).max(5000),
  agenda: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  participants: z.array(z.string().trim().min(1).max(100)).min(2).max(5),
  room_layout: z.enum(['conference', 'boardroom', 'discussion']).default('conference'),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.participants).size !== value.participants.length) ctx.addIssue({ code: 'custom', path: ['participants'], message: 'Choose each engineer only once.' });
  value.participants.forEach((id, index) => { if (!roleIds.has(id)) ctx.addIssue({ code: 'custom', path: ['participants', index], message: 'Unknown engineer role.' }); });
  if (new TextEncoder().encode(JSON.stringify(value)).length > 12_000) ctx.addIssue({ code: 'custom', path: [], message: 'Meeting configuration is too large.' });
});

export async function GET(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const { data, error } = await adminSupabase().from('workforce_meetings')
    .select('id,title,objective,agenda,participants,room_layout,status,summary,created_at,updated_at,started_at,completed_at')
    .eq('user_id', ctx.user.id).order('updated_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'Meetings could not be loaded. Apply supabase/migrations/20261014100000_workforce_meetings.sql first.' }, { status: 503 });
  return NextResponse.json({ meetings: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const owner = true;
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!canUseManualAgents(plan.key, owner)) return NextResponse.json({ error: 'AI workforce meetings require a Pro or Business plan.' }, { status: 403 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workforce-meeting-create', 10, 3600);
  if (limited) return limited;
  const parsed = meetingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid meeting configuration. Choose a title, objective, and 2–5 valid engineers.' }, { status: 400 });
  const db = adminSupabase();
  const model = getConfiguredModel();
  const { data, error } = await db.from('workforce_meetings').insert({
    user_id: ctx.user.id,
    title: parsed.data.title,
    objective: parsed.data.objective,
    agenda: parsed.data.agenda,
    participants: parsed.data.participants,
    room_layout: parsed.data.room_layout,
    status: 'scheduled',
    model,
  }).select('id,title,objective,agenda,participants,room_layout,status,created_at,updated_at').single();
  if (error) return NextResponse.json({ error: 'Meeting could not be saved. Apply the included Supabase migration and try again.' }, { status: 503 });
  return NextResponse.json({ meeting: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
