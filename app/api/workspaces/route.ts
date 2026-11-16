import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllows } from '@/lib/plan-access';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data, error } = await adminSupabase().from('projects').select('id,project_name,type,status,created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: 'Project workspaces could not be loaded.' }, { status: 503 });
  return NextResponse.json({ data: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return NextResponse.json({ error: 'Give this project workspace a name.' }, { status: 400 });
  const owner = isPlatformOwner(auth.profile);
  const plan = await getEffectiveUserPlan(auth.user.id, owner);
  if (!owner && (!plan.projectTypes.includes('web_app') || !planAllows(plan, 'web-app-builder'))) return NextResponse.json({ error: 'Project workspaces are not included in your current plan.' }, { status: 403 });
  const { count, error: countError } = await adminSupabase().from('projects').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
  if (countError) return NextResponse.json({ error: 'Project capacity could not be checked.' }, { status: 503 });
  if (!owner && (count || 0) >= plan.limits.maxProjects) return NextResponse.json({ error: 'Your project limit has been reached.' }, { status: 409 });
  const { data, error } = await adminSupabase().from('projects').insert({ user_id: auth.user.id, project_name: name, type: 'web_app', status: 'draft', progress: 0, files: {} }).select('id,project_name,type,status,created_at').single();
  if (error) return NextResponse.json({ error: 'Project workspace could not be created.' }, { status: 503 });
  return NextResponse.json({ data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
