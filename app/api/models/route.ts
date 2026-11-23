import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { getDefaultTextModel, getModelProviderStatus } from '@/lib/ai/provider-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ctx = await getProfile(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in to view available models.' }, { status: 401 });
  const models = getModelProviderStatus();\n  const configured = models.filter(model => model.credential_present);\n  const operational = models.filter(model => model.operational);
  const defaults: { chat?: string; reasoning?: string } = {};
  try { defaults.chat = getDefaultTextModel('chat'); } catch { /* empty state is returned below */ }
  try { defaults.reasoning = getDefaultTextModel('reasoning'); } catch { /* empty state is returned below */ }
  return NextResponse.json({
    models: getModelProviderStatus(),
    configured_count: configured.length,
    defaults,
    error: operational.length ? undefined : configured.length ? 'Gemini credentials are present, but no model has passed a live generation health check in this runtime.' : 'No Gemini API credential is configured in this deployment.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
