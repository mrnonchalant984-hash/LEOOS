import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const db = adminSupabase();
  const now = new Date().toISOString();
  const { data: expired, error } = await db.from('cloud_build_jobs')
    .select('id,owner_user_id,artifact_storage_path')
    .eq('provider', 'expo-eas')
    .not('artifact_storage_path', 'is', null)
    .lt('artifact_expires_at', now)
    .order('artifact_expires_at', { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Expired artifact metadata could not be loaded.' }, { status: 503 });

  let deleted = 0;
  let failed = 0;
  for (const artifact of expired || []) {
    const expectedPath = `expo-artifacts/${artifact.owner_user_id}/leonardx-${artifact.id}.`;
    if (typeof artifact.artifact_storage_path !== 'string' || !artifact.artifact_storage_path.startsWith(expectedPath) ||
        !/\.(?:apk|aab|ipa)$/.test(artifact.artifact_storage_path)) {
      failed++;
      continue;
    }
    const removed = await db.storage.from('leo-files').remove([artifact.artifact_storage_path]);
    if (removed.error) {
      failed++;
      continue;
    }
    const cleared = await db.from('cloud_build_jobs').update({
      artifact_storage_path: null,
      artifact_size_bytes: null,
      artifact_sha256: null,
      artifact_content_type: null,
      artifact_file_name: null,
      updated_at: now,
    }).eq('id', artifact.id).eq('owner_user_id', artifact.owner_user_id).eq('provider', 'expo-eas');
    if (cleared.error) failed++;
    else deleted++;
  }
  return NextResponse.json({ checked: expired?.length || 0, deleted, failed, at: now }, { headers: { 'Cache-Control': 'no-store' } });
}