import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { getDefaultTextModel, resolveModel } from '@/lib/ai/model-catalog';
import { ModelProviderError } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to LeonardX before starting the Leo Agent Host.' }, { status: 401 });
  try {
    const reference = getDefaultTextModel();
    const resolved = resolveModel(reference);
    if (resolved.provider !== 'google') return NextResponse.json({ error: 'Only the LeonardX Gemini model router is enabled for Leo Agent Host.' }, { status: 503 });
    return NextResponse.json({
      model: `${resolved.provider}/${resolved.model}`,
      models: [{ id: resolved.model, name: resolved.model }],
      provider: 'google',
      routing: 'server-controlled',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof ModelProviderError ? error.message : 'Gemini is not configured on the LeonardX server.';
    return NextResponse.json({ error: message }, { status: error instanceof ModelProviderError ? error.statusCode : 503 });
  }
}
