import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 32 || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as any;
  if (!b || typeof b.job_id !== 'string' || typeof b.user_id !== 'string' || typeof b.kind !== 'string' || typeof b.operation !== 'string' || typeof b.expires_at !== 'string' || typeof b.ticket_signature !== 'string') return NextResponse.json({ error: 'Invalid runtime ticket.' }, { status: 400 });
  const exp = Number(b.expires_at), now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 600) return NextResponse.json({ error: 'Expired runtime ticket.' }, { status: 403 });
  const expected = createHmac('sha256', secret).update([b.job_id, b.user_id, b.kind, b.operation, b.expires_at].join('.')).digest();
  let supplied: Buffer; try { supplied = Buffer.from(b.ticket_signature, 'hex'); } catch { return NextResponse.json({ error: 'Invalid runtime signature.' }, { status: 403 }); }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: 'Invalid runtime signature.' }, { status: 403 });
  const db = adminSupabase();
  const { data: job, error } = await db.from('private_runtime_jobs').select('id,owner_id,kind,operation,status,storage_path,expires_at').eq('id', b.job_id).eq('owner_id', b.user_id).eq('kind', b.kind).eq('operation', b.operation).maybeSingle();
  if (error || !job || job.status !== 'queued' || new Date(job.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'Runtime job not found, already claimed, or expired.' }, { status: 404 });
  const claim = await db.from('private_runtime_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', b.job_id).eq('status', 'queued').select('id').maybeSingle();
  if (claim.error || !claim.data) return NextResponse.json({ error: 'Runtime job has already been claimed.' }, { status: 409 });
  const { data: file, error: downloadError } = await db.storage.from('leo-files').download(job.storage_path);
  if (downloadError || !file) { await db.from('private_runtime_jobs').update({ status: 'failed', error: 'Runtime payload unavailable.', completed_at: new Date().toISOString() }).eq('id', b.job_id).eq('status', 'running'); return NextResponse.json({ error: 'Runtime payload unavailable.' }, { status: 503 }); }
  return new NextResponse(new Uint8Array(await file.arrayBuffer()), { headers: { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename=runtime-payload.zip' } });
}
