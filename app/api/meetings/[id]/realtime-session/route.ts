import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Realtime audio is unavailable until the Gemini audio workflow is implemented and verified.
 * This endpoint deliberately does not create provider sessions or expose secrets.
 * Re-enable voice only after a supported Gemini audio workflow is implemented
 * and verified end-to-end.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const { id } = await context.params;
  const { data: meeting, error } = await adminSupabase()
    .from('workforce_meetings')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Meeting storage is unavailable.' }, { status: 503 });
  if (!meeting) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
  return NextResponse.json({
    error: 'Live Realtime meetings are temporarily unavailable during the Gemini-only migration. No provider session was created.',
    code: 'GEMINI_AUDIO_WORKFLOW_NOT_VERIFIED',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
