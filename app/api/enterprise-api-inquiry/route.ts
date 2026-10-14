import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProfile, adminSupabase } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const inquirySchema = z.object({
  organization: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(254),
  expectedMonthlyRequests: z.enum(['under_100k', '100k_1m', '1m_10m', 'over_10m', 'unknown']),
  useCase: z.string().trim().min(20).max(2000),
}).strict();

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to submit an enterprise API inquiry.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'enterprise-api-inquiry', 3, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Provide an organization, valid work email, expected usage range, and a use case of 20–2000 characters.' }, { status: 400 });
  const { error } = await adminSupabase().from('api_enterprise_inquiries').insert({
    user_id: ctx.user.id,
    organization: parsed.data.organization,
    work_email: parsed.data.workEmail,
    expected_monthly_requests: parsed.data.expectedMonthlyRequests,
    use_case: parsed.data.useCase,
    status: 'new',
  });
  if (error) return NextResponse.json({ error: 'The inquiry could not be saved. Please try again later.' }, { status: 503 });
  return NextResponse.json({ status: 'received', message: 'Your enterprise API inquiry was recorded. No plan, price, SLA, or access level is active until reviewed and agreed.' }, { status: 201 });
}
