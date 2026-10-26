import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { runSkillScript } from '@/lib/skills/registry';

export const runtime = 'nodejs';
export const maxDuration = 65;

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to run a skill script.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.name !== 'string' || typeof body.script !== 'string') return NextResponse.json({ error: 'Skill name and script are required.' }, { status: 400 });
  try {
    const result = await runSkillScript(body.name, body.script, Array.isArray(body.args) ? body.args.map(String) : [], ctx.user.id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Skill script failed.' }, { status: 400 }); }
}
