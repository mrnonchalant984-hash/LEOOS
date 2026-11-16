import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';
import { skillNameSchema } from '@/lib/skills/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Sign in to view skill execution logs.' }, { status: 401 });
  let name: string;
  try { name = skillNameSchema.parse((await params).name); }
  catch { return NextResponse.json({ error: 'Skill not found.' }, { status: 404 }); }
  const db = adminSupabase();
  const { data: skill, error: skillError } = await db.from('skills').select('id')
    .eq('name', name).eq('owner_id', auth.user.id).maybeSingle();
  if (skillError) return NextResponse.json({ error: 'Skill could not be loaded.' }, { status: 503 });
  if (!skill) return NextResponse.json({ error: 'User skill logs were not found.' }, { status: 404 });
  const { data, error } = await db.from('skill_executions')
    .select('id,script_path,status,exit_code,stdout,stderr,duration_ms,created_at,completed_at')
    .eq('skill_id', skill.id).eq('owner_id', auth.user.id).order('created_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'Skill execution logs are unavailable. Apply the skill lifecycle migration.' }, { status: 503 });
  const { data: runtimeJobs, error: runtimeError } = await db.from('private_runtime_jobs').select('id,operation,status,metadata,result,error,created_at,completed_at').eq('owner_id', auth.user.id).eq('kind', 'skill').order('created_at', { ascending: false }).limit(50);
  if (runtimeError) return NextResponse.json({ error: 'Runtime execution history is unavailable. Apply the private runtime jobs migration.' }, { status: 503 });
  const runtimeExecutions = (runtimeJobs || []).filter(job => job.metadata?.skill_name === name).map(job => ({ id: job.id, script_path: job.metadata?.script_path || '', status: job.status === 'completed' ? 'succeeded' : job.status, exit_code: job.result?.exit_code ?? null, stdout: job.result?.stdout || '', stderr: job.result?.stderr || job.error || '', duration_ms: job.result?.duration_ms ?? null, created_at: job.created_at, completed_at: job.completed_at }));
  return NextResponse.json({ executions: [...runtimeExecutions, ...(data || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 50) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
