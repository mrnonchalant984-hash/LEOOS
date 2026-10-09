import { NextRequest, NextResponse } from 'next/server';
import { getProfile, isPlatformOwner } from '@/lib/auth';
import { listTrustedPlugins, registerTrustedPlugin } from '@/lib/plugins';

export async function GET() { return NextResponse.json({ plugins: listTrustedPlugins() }); }

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx || !isPlatformOwner(ctx.profile)) return NextResponse.json({ error: 'Platform owner access required.' }, { status: 403 });
  try { return NextResponse.json({ plugin: registerTrustedPlugin(await req.json()) }, { status: 201 }); }
  catch { return NextResponse.json({ error: 'Invalid plugin manifest.' }, { status: 400 }); }
}
