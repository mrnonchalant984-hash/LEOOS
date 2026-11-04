import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Research execution is disabled until a Gemini-backed research workflow is implemented and verified. */
export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Please sign in to use research.' }, { status: 401 });
  return NextResponse.json({
    error: 'The legacy research endpoint is temporarily unavailable during the Gemini-only migration. No model request was sent.',
    code: 'GEMINI_RESEARCH_MIGRATION_PENDING',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
