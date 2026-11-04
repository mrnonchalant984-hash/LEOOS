import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const context = await getProfile(req);
  if (!context) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    user: {
      id: context.user.id,
      email: context.user.email,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
