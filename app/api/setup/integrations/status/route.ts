import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { getIntegrationStatuses, type IntegrationId } from '@/lib/integration-status';
const ids = new Set<IntegrationId>(['openai', 'supabase', 'paystack', 'web3forms', 'resend', 'vercel', 'github', 'google', 'stripe', 'whatsapp']);
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const limited = await enforceUserRateLimit(owner.user.id, 'integration-status-check', 12, 60);
  if (limited) return limited;
  const requested = request.nextUrl.searchParams.get('service') as IntegrationId | null;
  if (requested && !ids.has(requested)) return NextResponse.json({ error: 'Unsupported integration.' }, { status: 400 });
  const statuses = await getIntegrationStatuses(requested || undefined);
  return NextResponse.json({ statuses, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
