import { timingSafeEqual, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runAndroidBuildWorker } from '@/lib/android-build-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function authorized(request: NextRequest) {
  const secret = process.env.ANDROID_BUILD_WORKER_SECRET || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '';
  if (process.env.ANDROID_BUILD_WORKER_ENABLED !== 'true' || secret.length < 32 || bearer.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(bearer), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Android worker is disabled or unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const result = await runAndroidBuildWorker(`android-worker-${randomUUID()}`);
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Android worker failed.';
    return NextResponse.json({ error: message, retry: 'The queue lease will expire automatically if a job was claimed; invoke the worker again after fixing the reported issue.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
