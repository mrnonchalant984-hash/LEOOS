import { NextResponse } from 'next/server';
import { getUserAccess, isPlatformOwner } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ authenticated: false });
  return NextResponse.json({
    authenticated: true,
    user: { id: access.user.id, email: access.user.email, role: access.profile?.role ?? 'user' },
    isPlatformOwner: isPlatformOwner({ role: access.profile?.role, email: access.user.email }),
    subscription: access.subscription,
    features: access.features,
  });
}
