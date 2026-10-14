import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const db = adminSupabase();
  const [jobs, workers] = await Promise.all([
    db.from('workforce_role_jobs').select('id,status,created_at,updated_at,started_at,completed_at,error_code').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(500),
    db.from('workforce_worker_heartbeats').select('worker_id,status,job_id,error_code,started_at,finished_at,created_at').order('created_at', { ascending: false }).limit(50),
  ]);
  if (jobs.error || workers.error) return NextResponse.json({ error: 'Monitoring tables are unavailable. Apply workforce migrations.' }, { status: 503 });
  const rows = jobs.data || [];
  const counts = Object.fromEntries(['queued','running','succeeded','failed','blocked','cancelled'].map(status => [status, rows.filter(row => row.status === status).length]));
  const oldestQueued = rows.filter(row => row.status === 'queued').map(row => Date.parse(row.created_at)).filter(Number.isFinite).sort((a,b) => a-b)[0];
  return NextResponse.json({ generated_at: new Date().toISOString(), queue: { sampled_jobs: rows.length, counts, oldest_queued_age_seconds: oldestQueued ? Math.max(0, Math.floor((Date.now()-oldestQueued)/1000)) : null }, workers: workers.data || [], worker_enabled: process.env.WORKFORCE_WORKER_ENABLED === 'true', runner_configured: Boolean(process.env.REPOSITORY_RUNNER_URL && (process.env.RUNNER_HMAC_SECRET || '').length >= 32), offline_sync_configured: true }, { headers: { 'Cache-Control': 'no-store' } });
}
