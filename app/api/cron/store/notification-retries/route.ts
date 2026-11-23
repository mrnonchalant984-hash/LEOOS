import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';
import { notifyMarketplaceUser } from '@/lib/store-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const db = adminSupabase();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: deliveries, error } = await db.from('marketplace_notification_deliveries')
    .select('notification_id').in('status', ['pending','failed','skipped'])
    .lt('attempt_count', 5).lt('updated_at', cutoff).order('updated_at', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: 'Notification retry queue is unavailable.' }, { status: 503 });
  const notificationIds = [...new Set((deliveries ?? []).map(item => item.notification_id))];
  if (!notificationIds.length) return NextResponse.json({ processed: 0, retried: 0 });
  const { data: notifications, error: notificationError } = await db.from('marketplace_notifications')
    .select('id,user_id,kind,title,body,href,dedupe_key,preference_key')
    .in('id', notificationIds).limit(100);
  if (notificationError) return NextResponse.json({ error: 'Notification retry payloads are unavailable.' }, { status: 503 });
  let retried = 0;
  const results: Array<{ id: string; status: string }> = [];
  for (const item of notifications ?? []) {
    try {
      await notifyMarketplaceUser({
        userId: item.user_id, kind: item.kind, title: item.title, body: item.body,
        href: item.href || '/store', preference: item.preference_key,
        idempotencyKey: item.dedupe_key,
      });
      retried += 1;
      results.push({ id: item.id, status: 'retry_attempted' });
    } catch (caught) {
      results.push({ id: item.id, status: 'retry_failed' });
      console.error('Marketplace notification retry failed:', caught instanceof Error ? caught.message : 'unknown error');
    }
  }
  return NextResponse.json({ processed: notifications?.length ?? 0, retried, results }, { headers: { 'Cache-Control': 'no-store' } });
}
