import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth) return NextResponse.json({ error: 'Platform-owner authentication required.' }, { status: 403 });
  const db = adminSupabase();
  const [jobs, workers, agentJobs] = await Promise.all([
    db.from('workforce_role_jobs').select('id,status,created_at,updated_at,started_at,completed_at,error_code').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(500),
    db.from('workforce_worker_heartbeats').select('worker_id,status,job_id,error_code,started_at,finished_at,created_at').order('created_at', { ascending: false }).limit(50),
    // Aggregate only operational metadata. Never select agent prompts, context, or results.
    db.from('agent_jobs').select('id,status,created_at,updated_at,attempts,lease_expires_at').order('created_at', { ascending: false }).limit(500),
  ]);
  if (jobs.error || workers.error) return NextResponse.json({ error: 'Monitoring tables are unavailable. Apply workforce migrations.' }, { status: 503 });
  const rows = jobs.data || [];
  const agentRows = agentJobs.error ? [] : (agentJobs.data || []);
  const agentCounts = Object.fromEntries(['queued','running','succeeded','failed','cancelled'].map(status => [status, agentRows.filter(row => row.status === status).length]));
  const oldestAgentQueued = agentRows.filter(row => row.status === 'queued').map(row => Date.parse(row.created_at)).filter(Number.isFinite).sort((a,b) => a-b)[0];
  const expiredAgentLeases = agentRows.filter(row => row.status === 'running' && row.lease_expires_at && Date.parse(row.lease_expires_at) < Date.now()).length;
  const lastAgentCompletion = agentRows.filter(row => row.status === 'succeeded').map(row => row.updated_at).filter(Boolean).sort().at(-1) || null;
  const agentQueue = { available: !agentJobs.error, sampled_jobs: agentRows.length, counts: agentCounts, oldest_queued_age_seconds: oldestAgentQueued ? Math.max(0, Math.floor((Date.now()-oldestAgentQueued)/1000)) : null, active_jobs: agentCounts.running, expired_leases: expiredAgentLeases, retry_attempts_sampled: agentRows.reduce((total,row) => total + Math.max(0, Number(row.attempts || 0) - 1), 0), last_successful_completion: lastAgentCompletion };
  const counts = Object.fromEntries(['queued','running','succeeded','failed','blocked','cancelled'].map(status => [status, rows.filter(row => row.status === status).length]));
  const oldestQueued = rows.filter(row => row.status === 'queued').map(row => Date.parse(row.created_at)).filter(Number.isFinite).sort((a,b) => a-b)[0];
  return NextResponse.json({ generated_at: new Date().toISOString(), queue: { sampled_jobs: rows.length, counts, oldest_queued_age_seconds: oldestQueued ? Math.max(0, Math.floor((Date.now()-oldestQueued)/1000)) : null }, agent_queue: agentQueue, workers: workers.data || [], worker_enabled: process.env.WORKFORCE_WORKER_ENABLED === 'true', runner_configured: Boolean(process.env.REPOSITORY_RUNNER_URL && (process.env.RUNNER_HMAC_SECRET || '').length >= 32), offline_sync_configured: true }, { headers: { 'Cache-Control': 'no-store' } });
}
