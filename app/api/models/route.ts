import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { getDefaultTextModel, getModelProviderStatus } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view available models.' }, { status: 401 });
  const models = getModelProviderStatus();
  const configured = models.filter(model => model.credential_present);
  const operational = models.filter(model => model.operational);
  const defaults: { chat?: string; reasoning?: string } = {};
  try { defaults.chat = getDefaultTextModel('chat'); } catch { /* empty state is returned below */ }
  try { defaults.reasoning = getDefaultTextModel('reasoning'); } catch { /* empty state is returned below */ }
  return NextResponse.json({
    models,
    configured_count: configured.length,
    operational_count: operational.length,
    defaults,
    error: operational.length ? undefined : configured.length
      ? 'Gemini credentials are present, but no model has passed a successful live generation check in this runtime.'
      : 'No Gemini API credential is configured in this deployment.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
