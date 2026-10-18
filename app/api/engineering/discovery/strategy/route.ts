import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { buildProjectStrategy, validateDiscoveryAnswers } from '@/lib/project-discovery';
import { BUDGET_OPTIONS } from '@/lib/capability-alternatives';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    budgetOptions: BUDGET_OPTIONS,
    modes: [
      { id: 'discovery', label: 'Discovery mode', description: 'Ask material questions and produce an editable strategy.' },
      { id: 'autonomous', label: 'Autonomous mode', description: 'Infer defaults from the repository, explain assumptions, and pause for credentials or irreversible actions.' },
    ],
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-discovery-strategy', 30, 60);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid JSON body.' }, { status: 400 });
  }

  const validated = validateDiscoveryAnswers(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const strategy = buildProjectStrategy(validated.data);
  return NextResponse.json(
    { answers: validated.data, strategy },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
