import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { verifyExpoArtifact, type ExpoArtifactType } from '@/lib/builders/expo-artifact';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;
const BUCKET = 'leo-files';
const expectedContentTypes: Record<ExpoArtifactType, string> = {
  apk: 'application/vnd.android.package-archive',
  aab: 'application/octet-stream',
  ipa: 'application/octet-stream',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuildActor(req, 'mcp:read');
  if (!ctx) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'expo-cloud-build-artifact', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  const db = adminSupabase();
  const { data: job, error } = await db.from('cloud_build_jobs')
    .select('id,project_id,provider_job_id,status,artifact_storage_path,artifact_size_bytes,artifact_sha256,artifact_content_type,artifact_file_name,artifact_expires_at').eq('id', id).eq('owner_user_id', ctx.user.id)
    .eq('provider', 'expo-eas').maybeSingle();
  if (error) return NextResponse.json({ error: 'Build ownership could not be checked.' }, { status: 503 });
  if (!job) return NextResponse.json({ error: 'Build job not found.' }, { status: 404 });
  if (job.status !== 'completed' || !job.provider_job_id || !job.artifact_storage_path || !job.artifact_size_bytes || !job.artifact_sha256 || !job.artifact_file_name || !job.artifact_expires_at) {
    return NextResponse.json({ error: 'A verified artifact is not available for this build.' }, { status: 409 });
  }
  if (new Date(job.artifact_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'This build artifact has expired. Start a new build to create another download.' }, { status: 410 });
  const extension = /\.(apk|aab|ipa)$/.exec(job.artifact_file_name)?.[1] as ExpoArtifactType | undefined;
  const expectedPath = extension ? `expo-artifacts/${ctx.user.id}/leonardx-${id}.${extension}` : '';
  if (!extension || job.artifact_storage_path !== expectedPath || job.artifact_content_type !== expectedContentTypes[extension]) {
    return NextResponse.json({ error: 'Stored artifact metadata failed its ownership or type check.' }, { status: 503 });
  }
  const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(job.artifact_storage_path);
  if (downloadError || !blob) return NextResponse.json({ error: 'The verified artifact could not be retrieved from private storage.' }, { status: 502 });
  const bytes = Buffer.from(await blob.arrayBuffer());
  const verified = await verifyExpoArtifact(bytes, extension);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (!verified || bytes.length !== Number(job.artifact_size_bytes) || verified.sha256 !== job.artifact_sha256 || checksum !== job.artifact_sha256) {
    return NextResponse.json({ error: 'Stored artifact failed package type, byte count, or SHA-256 verification.' }, { status: 502 });
  }
  return new Response(bytes, { status: 200, headers: {
    'Content-Type': expectedContentTypes[extension],
    'Content-Disposition': `attachment; filename="${job.artifact_file_name}"`,
    'Content-Length': String(bytes.length),
    'Content-SHA256': checksum,
    ETag: `"${checksum}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
