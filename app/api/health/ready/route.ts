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
    modelProvider: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()),
    agentWorkerEnabled: true,
    workforceWorkerEnabled: process.env.WORKFORCE_WORKER_ENABLED === 'true',
    workflowWorkerEnabled: process.env.WORKFLOW_WORKER_ENABLED === 'true',
    cronSecretStrong: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32),
  };
  const checks: Record<string, boolean> = { configuration: Object.values(env).every(Boolean) };
  checks.geminiProviderConfigured = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
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
