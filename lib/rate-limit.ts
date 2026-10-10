import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

/** Consume a shared Postgres user bucket. Fail closed if the limiter is unavailable. */
export async function enforceUserRateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  try {
    const { data, error } = await adminSupabase().rpc('consume_user_rate_limit', {
      p_user_id: userId,
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      return NextResponse.json(
        { error: 'Rate limiting is temporarily unavailable. Try again shortly.' },
        { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } },
      );
    }

    if (data !== true) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(windowSeconds), 'Cache-Control': 'no-store' } },
      );
    }

    return null;
  } catch {
    return NextResponse.json(
      { error: 'Rate limiting is temporarily unavailable. Try again shortly.' },
      { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } },
    );
  }
}
