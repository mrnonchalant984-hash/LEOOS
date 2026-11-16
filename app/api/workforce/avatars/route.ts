import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint is intentionally unavailable until Google image-to-video support is
// wired to the avatar workflow and verified end-to-end. It must not silently fall back.
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const limited = await enforceUserRateLimit(auth.user.id, 'workforce-avatar-video', 3, 3600);
  if (limited) return limited;
  return NextResponse.json({
    available: false,
    provider: 'google',
    error: 'Generated avatar clips are not enabled. The configured Google video workflow currently supports text-to-video only.',
  }, { status: 501, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  return NextResponse.json({ available: false, provider: 'google', error: 'Avatar video status is unavailable because avatar generation is not enabled.' }, { status: 501, headers: { 'Cache-Control': 'no-store' } });
}
