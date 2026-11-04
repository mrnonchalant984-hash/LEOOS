import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Local-model execution is disabled to enforce the Gemini-only model policy. */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    error: 'Local-model chat is disabled in this Gemini-only deployment. Configure GEMINI_API_KEY and use the standard Leo chat endpoint.',
    code: 'LOCAL_MODEL_DISABLED',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
