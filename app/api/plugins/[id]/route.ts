import { NextRequest, NextResponse } from 'next/server';
import { getProfile, isPlatformOwner } from '@/lib/auth';
import { pluginLifecycleSchema } from '@/lib/plugins-core';
import { updatePluginLifecycle } from '@/lib/plugins';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getProfile(req);
  if (!context || !isPlatformOwner(context.profile) || !context.profile.twofa_verified) {
    return NextResponse.json({ error: 'Platform owner 2FA access required.' }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(id)) return NextResponse.json({ error: 'Invalid plugin ID.' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const version = typeof body?.version === 'string' ? body.version : '';
  const status = pluginLifecycleSchema.safeParse(body?.status);
  if (!/^\d+\.\d+\.\d+$/.test(version) || !status.success || status.data === 'registered') {
    return NextResponse.json({ error: 'Provide a valid version and lifecycle status.' }, { status: 400 });
  }

  try {
    const plugin = await updatePluginLifecycle(id, version, status.data);
    if (!plugin) return NextResponse.json({ error: 'Plugin version not found.' }, { status: 404 });
    return NextResponse.json({ plugin });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Disable the currently enabled version')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Plugin lifecycle could not be updated.' }, { status: 503 });
  }
}
