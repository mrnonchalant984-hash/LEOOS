import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { getEffectiveUserPlan } from '@/lib/plan-access';
import { canUseManualAgents } from '@/lib/agents/entitlements';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { PROFESSIONAL_ROLES } from '@/lib/agents/professional-roles';

export const runtime = 'nodejs';
const roleMap = new Map(PROFESSIONAL_ROLES.map(role => [role.id, role]));
const createSchema = z.object({ role_id: z.string().min(1).max(100), title: z.string().trim().min(2).max(160).optional() }).strict();
export async function GET(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const { data, error } = await adminSupabase().from('workforce_conversations').select('id,role_id,role_name,title,status,created_at,updated_at').eq('user_id', ctx.user.id).order('updated_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'Conversation storage is unavailable. Apply the included workforce migration.' }, { status: 503 });
  return NextResponse.json({ conversations: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: NextRequest) {
  const ctx = await requireOwner(req);
  if (!ctx) return NextResponse.json({ error: 'Owner authentication required. Verify your admin identity/device and sign in again.' }, { status: 403 });
  const owner = true;
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!canUseManualAgents(plan.key, owner)) return NextResponse.json({ error: 'Individual specialist conversations require a Pro or Business plan.' }, { status: 403 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'workforce-conversation-create', 20, 3600);
  if (limited) return limited;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid conversation request.' }, { status: 400 });
  const role = roleMap.get(parsed.data.role_id);
  if (!role) return NextResponse.json({ error: 'Engineer role not found.' }, { status: 404 });
  const { data, error } = await adminSupabase().from('workforce_conversations').insert({ user_id: ctx.user.id, role_id: role.id, role_name: role.name, title: parsed.data.title || `Chat with ${role.name}` }).select('id,role_id,role_name,title,status,created_at,updated_at').single();
  if (error) return NextResponse.json({ error: 'Conversation could not be saved. Apply the included workforce migration.' }, { status: 503 });
  return NextResponse.json({ conversation: data }, { status: 201 });
}
