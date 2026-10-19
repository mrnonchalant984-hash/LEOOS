import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public readiness probe: exposes only booleans, never credentials or raw provider errors. */
export async function GET() {
  const env = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ownerIdentity: Boolean(process.env.OWNER_EMAIL),
    modelProvider: Boolean(process.env.LEO_LOCAL_MODEL_URL || process.env.OPENAI_API_KEY || process.env.LEO_API_KEY),
    agentWorkerEnabled: true,
    workforceWorkerEnabled: process.env.WORKFORCE_WORKER_ENABLED === 'true',
    workflowWorkerEnabled: process.env.WORKFLOW_WORKER_ENABLED === 'true',
    cronSecretStrong: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32),
  };
  const checks: Record<string, boolean> = { configuration: Object.values(env).every(Boolean) };
  if (process.env.LEO_LOCAL_MODEL_URL?.trim()) {
    try {
      const base = process.env.LEO_LOCAL_MODEL_URL.trim().replace(/\/+$/, '');
      const response = await fetch(`${base}/models`, {
        signal: AbortSignal.timeout(2500),
        headers: process.env.LEO_LOCAL_MODEL_API_KEY ? { Authorization: `Bearer ${process.env.LEO_LOCAL_MODEL_API_KEY}` } : undefined,
      });
      checks.localModelReachable = response.ok;
    } catch {
      checks.localModelReachable = false;
    }
  } else {
    checks.hostedProviderConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.LEO_API_KEY);
  }
  try {
    const db = adminSupabase();
    const results = await Promise.all([
      db.from('profiles').select('id').limit(0),
      db.from('agent_jobs').select('id,lease_expires_at').limit(0),
      db.from('workflow_jobs').select('id,lease_expires_at').limit(0),
      db.from('workforce_role_jobs').select('id,lease_expires_at').limit(0),
      db.from('workforce_meetings').select('id').limit(0),
      db.from('workforce_conversations').select('id').limit(0),
    ]);
    checks.database = results[0].error === null;
    checks.agentWorkerSchema = results[1].error === null;
    checks.workflowWorkerSchema = results[2].error === null;
    checks.workforceQueueSchema = results[3].error === null;
    checks.meetingSchema = results[4].error === null;
    checks.conversationSchema = results[5].error === null;
  } catch {
    checks.database = false;
    checks.agentWorkerSchema = false;
    checks.workflowWorkerSchema = false;
    checks.workforceQueueSchema = false;
    checks.meetingSchema = false;
    checks.conversationSchema = false;
  }
  const ready = Object.values(checks).every(Boolean);
  return NextResponse.json({ status: ready ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() }, {
    status: ready ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
  });
}
