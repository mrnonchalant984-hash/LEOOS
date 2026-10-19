import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { getBuildActor } from '@/lib/builds/request-auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { verifyAndroidApk } from '@/lib/android-build';

export const runtime = 'nodejs';
export const maxDuration = 60;
const BUCKET = 'leo-files';
const MAX_APK_BYTES = 150 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getBuildActor(request, 'mcp:read');
  if (!actor) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const limited = await enforceUserRateLimit(actor.user.id, 'android-apk-download', 10, 60);
  if (limited) return limited;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid Android build job ID.' }, { status: 400 });
  const db = adminSupabase();
  const { data: artifact, error } = await db.from('android_build_jobs')
    .select('id,owner_user_id,status,storage_path,size_bytes,sha256')
    .eq('id', id).eq('owner_user_id', actor.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'APK ownership could not be checked.' }, { status: 503 });
  if (!artifact) return NextResponse.json({ error: 'APK artifact not found.' }, { status: 404 });
  if (artifact.status !== 'completed' || !artifact.storage_path || !artifact.sha256 || !artifact.size_bytes) {
    return NextResponse.json({ error: 'APK artifact is not available.' }, { status: 409 });
  }
  if (artifact.storage_path !== `android-artifacts/${actor.user.id}/${artifact.id}.apk`) {
    return NextResponse.json({ error: 'APK storage metadata failed its ownership check.' }, { status: 503 });
  }
  const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(artifact.storage_path);
  if (downloadError || !blob) return NextResponse.json({ error: 'APK artifact could not be retrieved from private storage.' }, { status: 502 });
  if (blob.size > MAX_APK_BYTES) return NextResponse.json({ error: 'APK artifact exceeds the download size limit.' }, { status: 413 });
  const bytes = Buffer.from(await blob.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (!verifyAndroidApk(bytes, Number(artifact.size_bytes), artifact.sha256) || checksum !== artifact.sha256) {
    return NextResponse.json({ error: 'Stored APK failed size, ZIP signature, or SHA-256 verification.' }, { status: 502 });
  }
  return new Response(bytes, { status: 200, headers: {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="leonardx-calculator-${id}.apk"`,
    'Content-Length': String(bytes.length),
    'Content-SHA256': checksum,
    ETag: `"${checksum}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
