import { NextResponse } from 'next/server';
import { openApiV1 } from '@/lib/openapi-v1';

export async function GET() {
  return NextResponse.json(openApiV1, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
