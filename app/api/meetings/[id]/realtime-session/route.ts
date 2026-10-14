import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getOpenAI } from '@/lib/openai';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(auth.user.id, 'workforce-realtime-meeting', 5, 3600);
  if (limited) return limited;
  const { id } = await context.params;
  const { data: meeting, error } = await adminSupabase().from('workforce_meetings').select('id,title,objective,agenda,participants,status').eq('id', id).eq('user_id', auth.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Meeting storage is unavailable.' }, { status: 503 });
  if (!meeting) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
  if (!Array.isArray(meeting.participants) || meeting.participants.length < 2 || meeting.participants.length > 5) return NextResponse.json({ error: 'Meeting participants are invalid.' }, { status: 409 });
  const roles = new Map<string, (typeof PROFESSIONAL_ROLES)[number]>(PROFESSIONAL_ROLES.map((role: (typeof PROFESSIONAL_ROLES)[number]) => [role.id, role]));
  const selected: Array<(typeof PROFESSIONAL_ROLES)[number]> = meeting.participants.flatMap((id: string): Array<(typeof PROFESSIONAL_ROLES)[number]> => {
    const role = roles.get(id);
    return role ? [role] : [];
  });
  if (selected.length !== meeting.participants.length) return NextResponse.json({ error: 'A meeting role is no longer available.' }, { status: 409 });
  const instructions = `You are facilitating a private owner-only LeonardX engineering meeting. This is a full-duplex voice session with the owner, not an automated claim that every listed specialist is speaking independently. Meeting: ${meeting.title}. Objective: ${meeting.objective}. Agenda: ${(meeting.agenda || []).join('; ')}. Specialist perspectives available for discussion: ${selected.map((role) => `${role.name}: ${role.instructions.slice(0, 500)}`).join('\n')}. Speak naturally, ask clarifying questions, state uncertainty, do not invent completed work, and summarize decisions only when they are explicitly agreed.`;
  try {
    const model = process.env.LEO_REALTIME_MODEL || 'gpt-realtime';
    const response = await getOpenAI().realtime.clientSecrets.create({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime', model, instructions, output_modalities: ['audio'],
        audio: {
          input: { turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true, threshold: 0.5, silence_duration_ms: 500, prefix_padding_ms: 300 } },
          output: { voice: 'marin' },
        },
      },
    });
    return NextResponse.json({ client_secret: { value: response.value, expires_at: response.expires_at }, model, meeting_id: meeting.id, mode: 'realtime_voice' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Realtime meeting session could not be created. Check provider configuration and account access.' }, { status: 503 });
  }
}
