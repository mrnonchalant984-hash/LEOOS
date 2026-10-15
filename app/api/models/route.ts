import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { getDefaultTextModel, getModelProviderStatus } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view available models.' }, { status: 401 });
  return NextResponse.json({
    models: getModelProviderStatus(),
    defaults: {
      chat: getDefaultTextModel('chat'),
      reasoning: getDefaultTextModel('reasoning'),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
