import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_MEMORY_LENGTH = 3000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownedProject(db: ReturnType<typeof adminSupabase>, projectId: string, userId: string) {
  const { data, error } = await db.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error('project_lookup_failed');
  return Boolean(data);
}

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const db = adminSupabase();
  const projectId = req.nextUrl.searchParams.get('project_id');
  if (projectId && !UUID_RE.test(projectId)) return NextResponse.json({ error: 'Invalid project ID.' }, { status: 400 });
  if (projectId) {
    try {
      if (!await ownedProject(db, projectId, ctx.user.id)) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    } catch {
      return NextResponse.json({ error: 'Project memory is unavailable. Apply the project-memory migration.' }, { status: 503 });
    }
  }
  let query = db.from('leo_memories').select('id,memory,source,project_id,created_at,updated_at')
    .eq('user_id', ctx.user.id).eq('active', true).order('updated_at', { ascending: false }).limit(200);
  query = projectId ? query.or(`project_id.is.null,project_id.eq.${projectId}`) : query.is('project_id', null);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Memory could not be loaded. Apply the project-memory migration if this is an upgraded database.' }, { status: 503 });
  return NextResponse.json({ memories: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const memory = typeof body?.memory === 'string' ? body.memory.trim() : '';
  const projectId = typeof body?.project_id === 'string' ? body.project_id : null;
  if (projectId && !UUID_RE.test(projectId)) return NextResponse.json({ error: 'Invalid project ID.' }, { status: 400 });
  if (!memory || memory.length > MAX_MEMORY_LENGTH) return NextResponse.json({ error: `Memory must contain 1–${MAX_MEMORY_LENGTH} characters.` }, { status: 400 });
  const source = ['user', 'chat', 'project', 'workflow', 'agent'].includes(body?.source) ? body.source : 'user';
  const db = adminSupabase();
  if (projectId) {
    try {
      if (!await ownedProject(db, projectId, ctx.user.id)) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    } catch {
      return NextResponse.json({ error: 'Project memory is unavailable. Apply the project-memory migration.' }, { status: 503 });
    }
  }
  const { data, error } = await db.from('leo_memories').insert({ user_id: ctx.user.id, memory, source, project_id: projectId })
    .select('id,memory,source,project_id,created_at').single();
  if (error) return NextResponse.json({ error: 'Memory could not be saved. Apply the project-memory migration if this is an upgraded database.' }, { status: 503 });
  return NextResponse.json({ memory: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Memory ID is required.' }, { status: 400 });
  const { error } = await adminSupabase().from('leo_memories').update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', ctx.user.id);
  if (error) return NextResponse.json({ error: 'Memory could not be archived.' }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
