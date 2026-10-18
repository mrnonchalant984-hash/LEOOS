import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import {
  insertEngineeringWorkflow,
  listEngineeringWorkflows,
  serializeWorkflow,
} from '@/lib/engineering-workflow-store';
import type { WorkflowApplicabilityInput, WorkflowMode } from '@/lib/engineering-workflow';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-workflows-list', 60, 60);
  if (limited) return limited;
  const limit = Number(request.nextUrl.searchParams.get('limit') || 20);
  const { data, error } = await listEngineeringWorkflows(auth.user.id, limit);
  if (error) return NextResponse.json({ error }, { status: 503 });
  return NextResponse.json(
    { workflows: data.map(serializeWorkflow) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await getProfile(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(auth.user.id, 'engineering-workflows-create', 20, 60);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid JSON body.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 3 || title.length > 160) {
    return NextResponse.json({ error: 'Title must be 3–160 characters.' }, { status: 400 });
  }
  const mode: WorkflowMode = body.mode === 'autonomous' ? 'autonomous' : 'discovery';
  const applicability = (body.applicability && typeof body.applicability === 'object'
    ? body.applicability
    : {}) as Partial<WorkflowApplicabilityInput>;

  const { data, error } = await insertEngineeringWorkflow({
    ownerUserId: auth.user.id,
    websiteProjectId: typeof body.websiteProjectId === 'string' ? body.websiteProjectId : null,
    mode,
    title,
    applicability: {
      mode,
      hasRepository: applicability.hasRepository === true,
      needsDatabase: applicability.needsDatabase !== false,
      needsMigrations: applicability.needsMigrations === true,
      needsDeployment: applicability.needsDeployment !== false,
      needsEnvironmentConfig: applicability.needsEnvironmentConfig !== false,
      needsIntegrations: applicability.needsIntegrations !== false,
      requiresUserApproval: mode === 'discovery' || applicability.requiresUserApproval === true,
    },
    budgetTier: typeof body.budgetTier === 'string' ? body.budgetTier : null,
    budgetAmount: typeof body.budgetAmount === 'number' ? body.budgetAmount : null,
    budgetCurrency: typeof body.budgetCurrency === 'string' ? body.budgetCurrency : null,
    summary: typeof body.summary === 'string' ? body.summary : null,
    strategy: body.strategy && typeof body.strategy === 'object'
      ? (body.strategy as Record<string, unknown>)
      : null,
  });

  if (error || !data) {
    return NextResponse.json({ error: error || 'Workflow could not be created.' }, { status: error?.includes('already active') ? 409 : 503 });
  }
  return NextResponse.json(
    { workflow: serializeWorkflow(data) },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
