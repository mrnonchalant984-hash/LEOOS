import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required worker configuration: ${name}.`);
  return value;
}

async function main() {
  const url = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'leonardx-android-worker-preflight' } },
  });

  // Read-only schema probe. Selecting the columns with limit(0) checks that the
  // reliability migration is applied without reading customer job data.
  const columns = [
    'id', 'status', 'project_id', 'owner_user_id', 'attempts', 'available_at',
    'lease_owner', 'lease_expires_at', 'started_at', 'storage_path', 'size_bytes',
    'sha256', 'completed_at',
  ].join(',');
  const { error: schemaError } = await db.from('android_build_jobs').select(columns).limit(0);
  if (schemaError) {
    throw new Error('Android build queue schema is unavailable or incomplete. Apply the queue and reliability migrations to the Supabase project referenced by these worker secrets.');
  }

  const { data: bucket, error: bucketError } = await db.storage.getBucket('leo-files');
  if (bucketError || !bucket) {
    throw new Error('Required Supabase Storage bucket leo-files is unavailable in the worker project.');
  }
  if (bucket.public !== false) {
    throw new Error('The leo-files storage bucket must be private before Android worker activation.');
  }

  // Deliberately do not print the URL, key, job data, or bucket metadata.
  console.log(JSON.stringify({
    preflight: 'passed',
    queue_schema: 'present',
    private_artifact_bucket: 'verified',
    secrets_exposed: false,
    note: 'This read-only preflight does not prove queue RPC execution or build success.',
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Android worker preflight failed.');
  process.exitCode = 1;
});
