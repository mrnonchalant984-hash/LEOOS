import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 32) return NextResponse.json({ error: 'Runtime callback is not configured.' }, { status: 503 });
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body.job_id !== 'string' || typeof body.user_id !== 'string' ||
      !['completed', 'failed'].includes(body.status) || typeof body.signature !== 'string') {
    return NextResponse.json({ error: 'Invalid runtime result.' }, { status: 400 });
  }
  const expected = createHmac('sha256', secret).update(`${body.job_id}.${body.user_id}.result`).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(body.signature, 'hex'); }
  catch { return NextResponse.json({ error: 'Invalid runtime signature.' }, { status: 403 }); }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'Invalid runtime signature.' }, { status: 403 });
  }

  const result = body.result && typeof body.result === 'object' ? body.result : {};
  const stdout = typeof result.stdout === 'string' ? result.stdout.slice(0, 50000) : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr.slice(0, 20000) : '';
  const safeResult = {
    stdout,
    stderr,
    exit_code: Number.isInteger(result.exit_code) ? result.exit_code : 1,
    duration_ms: Number.isFinite(result.duration_ms) ? Math.max(0, result.duration_ms) : 0,
    provider: 'github_actions',
  };
  const db = adminSupabase();
  const { data, error } = await db.from('private_runtime_jobs')
    .update({
      status: body.status,
      result: safeResult,
      error: body.status === 'failed' ? (stderr.slice(0, 1000) || 'Runtime job failed.') : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', body.job_id)
    .eq('owner_id', body.user_id)
    .in('status', ['running', 'queued'])
    .select('id,storage_path')
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Job result could not be saved; job may be expired or already completed.' }, { status: 409 });
  }
  if (data.storage_path) {
    await db.storage.from('leo-files').remove([data.storage_path]).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
