/** Read-only Supabase inspection for stuck workflow/build jobs. Never prints user data or secrets. */
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(2); }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const since = new Date(Date.now() - 30 * 60_000).toISOString();
const checks = [
  ['workflow_jobs', 'id,status,attempts,available_at,lease_expires_at,last_error_code,updated_at', 'status.in.(running,queued,dead_letter)'],
  ['workflow_runs', 'id,status,attempt_count,error_code,started_at,completed_at,updated_at', 'status.in.(running,queued,waiting_approval,failed)'],
  ['leo_build_jobs', 'id,status,attempts,lease_expires_at,error_code,updated_at', 'status.in.(running,queued,failed)'],
];
const results = [];
for (const [table, columns, filter] of checks) {
  const { data, error } = await db.from(table).select(columns).or(filter).gte('updated_at', since).order('updated_at', { ascending: false }).limit(100);
  results.push({ table, ok: !error, count: data?.length ?? 0, rows: (data || []).map(row => ({
    id: row.id, status: row.status, attempts: row.attempts ?? row.attempt_count ?? null,
    lease_expired: row.lease_expires_at ? Date.parse(row.lease_expires_at) < Date.now() : null,
    error_code: row.error_code ?? row.last_error_code ?? null, updated_at: row.updated_at,
  })), error: error ? { code: error.code, message: error.message.slice(0, 180) } : undefined });
}
console.log(JSON.stringify({ mode: 'read-only-workflow-health', since, results }, null, 2));
if (results.some(r => !r.ok)) process.exitCode = 1;
