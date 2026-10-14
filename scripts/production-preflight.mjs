import { existsSync, readFileSync } from 'node:fs';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'OWNER_EMAIL', 'CRON_SECRET', 'OPENAI_API_KEY',
  'AGENT_WORKER_ENABLED', 'WORKFORCE_WORKER_ENABLED', 'WORKFLOW_WORKER_ENABLED',
];
const missing = required.filter((key) => {
  const value = process.env[key]?.trim();
  if (key === 'OPENAI_API_KEY') return !value && !process.env.LEO_API_KEY?.trim() && !process.env.LEO_LOCAL_MODEL_URL?.trim();
  if (key === 'CRON_SECRET') return !value || value.length < 32;
  if (key.endsWith('_ENABLED')) return value !== 'true';
  return !value;
});
const migrations = [
  'supabase/migrations/20261012160000_reliability_controls.sql',
  'supabase/migrations/20261013130000_api_enterprise_workflow_foundation.sql',
  'supabase/migrations/20261014100000_workforce_meetings.sql',
  'supabase/migrations/20261014110000_project_memory_dependencies.sql',
  'supabase/migrations/20261014120000_production_workforce_hardening.sql',
  'supabase/migrations/20261014130000_durable_workforce_role_jobs.sql',
];
const missingMigrations = migrations.filter((path) => !existsSync(path));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const lockExists = existsSync('package-lock.json');
const issues = [];
if (missing.length) issues.push(`Missing or unsafe deployment settings: ${missing.join(', ')}`);
if (missingMigrations.length) issues.push(`Missing migrations: ${missingMigrations.join(', ')}`);
if (!lockExists) issues.push('package-lock.json is missing; deterministic installation is not available.');
if (!packageJson.scripts?.verify) issues.push('The full verify script is not configured.');
if (existsSync('.env.local')) issues.push('Local secret file .env.local exists in the working tree; ensure it is never committed or packaged.');
if (issues.length) {
  console.error('LeonardX production preflight: BLOCKED');
  for (const issue of issues) console.error(`- ${issue}`);
  console.error('This is a configuration preflight only. It does not replace tests, a successful build, migration dry-run, or staging verification.');
  process.exitCode = 1;
} else {
  console.log('LeonardX production preflight: static configuration checks passed.');
  console.log('Still required: npm run verify, apply migrations in staging, exercise readiness endpoint, load/security tests, and operator approval.');
}
