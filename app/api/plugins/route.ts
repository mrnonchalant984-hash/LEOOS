import { NextRequest, NextResponse } from 'next/server';
import { getProfile, isPlatformOwner } from '@/lib/auth';
import { pluginManifestSchema } from '@/lib/plugins-core';
import { listTrustedPlugins, registerTrustedPlugin } from '@/lib/plugins';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const includeAll = req.nextUrl.searchParams.get('include') === 'all';
  if (includeAll) {
    const context = await getProfile(req);
    if (!context || !isPlatformOwner(context.profile) || !context.profile.twofa_verified) {
      return NextResponse.json({ error: 'Platform owner 2FA access required.' }, { status: 403 });
    }
  }

  try {
    const plugins = await listTrustedPlugins(includeAll);
    return NextResponse.json({ plugins }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Plugin registry storage is unavailable. Apply its pending database migration before use.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const context = await getProfile(req);
  if (!context || !isPlatformOwner(context.profile) || !context.profile.twofa_verified) {
    return NextResponse.json({ error: 'Platform owner 2FA access required.' }, { status: 403 });
  }

  const input: unknown = await req.json().catch(() => null);
  const parsed = pluginManifestSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid plugin manifest or permissions.' }, { status: 400 });

  try {
    const plugin = await registerTrustedPlugin(parsed.data, context.user.id);
    return NextResponse.json({ plugin, notice: 'Registered as metadata only; code execution is disabled.' }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already registered')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Plugin registry storage is unavailable.' }, { status: 503 });
  }
}
