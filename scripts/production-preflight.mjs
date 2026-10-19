import { existsSync, readFileSync } from 'node:fs';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'OWNER_EMAIL', 'CRON_SECRET', 'OPENAI_API_KEY',
  'WORKFORCE_WORKER_ENABLED', 'WORKFLOW_WORKER_ENABLED',
  'ANDROID_BUILD_WORKER_ENABLED', 'ANDROID_BUILD_WORKER_SECRET',
  'GITHUB_TOKEN', 'VERCEL_TOKEN',
];
const missing = required.filter((key) => {
  const value = process.env[key]?.trim();
  if (key === 'OPENAI_API_KEY') return !value && !process.env.LEO_API_KEY?.trim() && !process.env.LEO_LOCAL_MODEL_URL?.trim();
  if (key === 'CRON_SECRET') return !value || value.length < 32;
  if (key === 'ANDROID_BUILD_WORKER_SECRET') return !value || value.length < 32;
  if (key.endsWith('_ENABLED')) return value !== 'true';
  return !value;
});
const migrations = [
  'supabase/migrations/20261015120000_mcp_oauth_and_connections.sql',
  'supabase/migrations/20261012160000_reliability_controls.sql',
  'supabase/migrations/20261013130000_api_enterprise_workflow_foundation.sql',
  'supabase/migrations/20261014100000_workforce_meetings.sql',
  'supabase/migrations/20261014110000_project_memory_dependencies.sql',
  'supabase/migrations/20261014120000_production_workforce_hardening.sql',
  'supabase/migrations/20261014130000_durable_workforce_role_jobs.sql',
  'supabase/migrations/20261018150000_cloud_build_jobs.sql',
  'supabase/migrations/20261019100000_android_build_artifacts.sql',
  'supabase/migrations/20261019120000_android_build_worker_queue.sql',
];
const missingMigrations = migrations.filter((path) => !existsSync(path));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const lockExists = existsSync('package-lock.json');
const issues = [];
if (missing.length) issues.push(`Missing or unsafe deployment settings: ${missing.join(', ')}`);
const mcpPublicUrl = process.env.MCP_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
if (!mcpPublicUrl) {
  issues.push('Set MCP_PUBLIC_URL to the deployed HTTPS origin.');
} else {
  try {
    const parsed = new URL(mcpPublicUrl);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      issues.push('MCP_PUBLIC_URL must be an HTTPS origin only, without credentials, path, query, or fragment.');
    }
  } catch {
    issues.push('MCP_PUBLIC_URL must be a valid HTTPS origin.');
  }
}
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
  console.log('Still required: apply migrations in staging, enable Google in Supabase, allowlist the app callback URL in Supabase, exercise readiness and MCP OAuth, load/security tests, and operator approval.');
}
