import { NextRequest, NextResponse } from 'next/server';
import { getProfile, adminSupabase } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const endpointId = new URL(req.url).searchParams.get('endpoint_id');
  if (!endpointId) return NextResponse.json({ error: 'Missing endpoint_id' }, { status: 400 });
  const { data, error } = await adminSupabase().from('webhook_deliveries')
    .select('id,event,status,attempts,response_status,last_error,created_at,delivered_at,next_attempt_at')
    .eq('endpoint_id', endpointId).eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(25);
  if (error) return NextResponse.json({ error: 'Could not load deliveries' }, { status: 500 });
  return NextResponse.json({ deliveries: data || [] });
}
