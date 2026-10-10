import { createLivenessResponse } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request) {
  return createLivenessResponse(request.headers.get('x-request-id'));
}
