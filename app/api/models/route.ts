import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { getDefaultTextModel, getModelProviderStatus } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view available models.' }, { status: 401 });
  const configured = getModelProviderStatus().filter(model => model.configured);
  const defaults: { chat?: string; reasoning?: string } = {};
  try { defaults.chat = getDefaultTextModel('chat'); } catch { /* empty state is returned below */ }
  try { defaults.reasoning = getDefaultTextModel('reasoning'); } catch { /* empty state is returned below */ }
  return NextResponse.json({
    models: getModelProviderStatus(),
    configured_count: configured.length,
    defaults,
    error: configured.length ? undefined : 'No configured text model is available in this deployment.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
