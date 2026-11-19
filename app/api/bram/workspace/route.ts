import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownedProject(projectId: string, userId: string) {
  if (!uuid.test(projectId)) return false;
  const { data, error } = await adminSupabase().from('projects').select('id')
    .eq('id', projectId).eq('user_id', userId).maybeSingle();
  return !error && !!data;
}

export async function GET(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return json({ error: 'Authentication required.' }, 401);
  const projectId = req.nextUrl.searchParams.get('project_id') || '';
  const kind = req.nextUrl.searchParams.get('kind') || 'all';
  if (!await ownedProject(projectId, auth.user.id)) return json({ error: 'Project not found or access denied.' }, 404);
  const db = adminSupabase();
  const result: Record<string, unknown> = {};
  if (kind === 'all' || kind === 'checklist') {
    const { data, error } = await db.from('bram_project_checklists').select('id,title,items,created_at,updated_at')
      .eq('project_id', projectId).eq('user_id', auth.user.id).maybeSingle();
    if (error) return json({ error: 'Checklist storage is unavailable. Apply the Bram workspace migration.' }, 503);
    result.checklist = data;
  }
  if (kind === 'all' || kind === 'resources') {
    const { data, error } = await db.from('bram_project_resources').select('id,title,url,publisher,description,source_type,created_at')
      .eq('project_id', projectId).eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(100);
    if (error) return json({ error: 'Project resource storage is unavailable. Apply the Bram workspace migration.' }, 503);
    result.resources = data || [];
  }
  if (!['all', 'checklist', 'resources'].includes(kind)) return json({ error: 'Unsupported workspace collection.' }, 400);
  return json(result);
}

export async function PUT(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return json({ error: 'Authentication required.' }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : 'Implementation checklist';
  const items = body.items;
  if (!await ownedProject(projectId, auth.user.id)) return json({ error: 'Project not found or access denied.' }, 404);
  if (title.length < 1 || title.length > 160 || !Array.isArray(items) || items.length > 200) return json({ error: 'Checklist title or items are invalid.' }, 400);
  const normalized = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return json({ error: 'Each checklist item must be an object.' }, 400);
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length > 80 || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 500 || typeof row.completed !== 'boolean') return json({ error: 'Checklist items require id, text, and completed fields.' }, 400);
    normalized.push({ id: row.id, text: row.text.trim(), completed: row.completed });
  }
  const { data, error } = await adminSupabase().from('bram_project_checklists')
    .upsert({ project_id: projectId, user_id: auth.user.id, title, items: normalized, updated_at: new Date().toISOString() }, { onConflict: 'project_id,user_id' })
    .select('id,title,items,updated_at').single();
  if (error) return json({ error: 'Checklist could not be saved.' }, 503);
  return json({ checklist: data, persisted: true });
}

export async function POST(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return json({ error: 'Authentication required.' }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const publisher = typeof body.publisher === 'string' ? body.publisher.trim().slice(0, 160) : null;
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null;
  const sourceType = ['research','documentation','reference','other'].includes(String(body.source_type)) ? String(body.source_type) : 'research';
  if (!await ownedProject(projectId, auth.user.id)) return json({ error: 'Project not found or access denied.' }, 404);
  if (!title || title.length > 240 || url.length > 2048) return json({ error: 'A valid title and URL are required.' }, 400);
  let parsed: URL;
  try { parsed = new URL(url); } catch { return json({ error: 'Resource URL must be valid.' }, 400); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return json({ error: 'Only public HTTP or HTTPS resource URLs are allowed.' }, 400);
  const { data, error } = await adminSupabase().from('bram_project_resources')
    .upsert({ project_id: projectId, user_id: auth.user.id, title, url: parsed.toString(), publisher, description, source_type: sourceType }, { onConflict: 'project_id,user_id,url' })
    .select('id,title,url,publisher,description,source_type,created_at').single();
  if (error) return json({ error: 'Resource could not be saved.' }, 503);
  return json({ resource: data, persisted: true }, 201);
}

export async function DELETE(req: NextRequest) {
  const auth = await getProfile(req);
  if (!auth) return json({ error: 'Authentication required.' }, 401);
  const projectId = req.nextUrl.searchParams.get('project_id') || '';
  const resourceId = req.nextUrl.searchParams.get('resource_id') || '';
  if (!uuid.test(resourceId) || !await ownedProject(projectId, auth.user.id)) return json({ error: 'Project or resource not found.' }, 404);
  const { error, count } = await adminSupabase().from('bram_project_resources').delete({ count: 'exact' })
    .eq('id', resourceId).eq('project_id', projectId).eq('user_id', auth.user.id);
  if (error) return json({ error: 'Resource could not be deleted.' }, 503);
  return count ? json({ deleted: true }) : json({ error: 'Resource not found.' }, 404);
}
