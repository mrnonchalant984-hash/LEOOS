import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const owner = await requireOwner(request);
  if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device and verified two-factor authentication is required.' }, { status: 403 });
  const { data, error } = await adminSupabase().from('marketplace_notification_deliveries')
    .select('id,user_id,channel,delivery_key,status,attempt_count,error_code,delivered_at,updated_at,notification:marketplace_notifications(title,kind)')
    .order('updated_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: 'Notification delivery evidence is unavailable.' }, { status: 503 });
  const counts = (data ?? []).reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return NextResponse.json({ deliveries: data ?? [], counts }, { headers: { 'Cache-Control': 'no-store' } });
}
