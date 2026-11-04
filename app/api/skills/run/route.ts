import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to run a skill script.' }, { status: 401 });
  return NextResponse.json(
    { error: 'Skill script execution is disabled until a separately isolated runner is deployed and verified.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
