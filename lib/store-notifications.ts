import { adminSupabase } from '@/lib/auth';
import { sendClientEmail } from '@/lib/notifications';
import webPush from 'web-push';

export async function notifyMarketplaceUser(input: { userId: string; kind: string; title: string; body: string; href: string; preference: 'messages' | 'order_updates' | 'support_updates' }) {
  const db = adminSupabase();
  const [{ data: prefs, error: preferenceError }, { error: notificationError }] = await Promise.all([
    db.from('marketplace_notification_preferences').select('messages,order_updates,support_updates').eq('user_id', input.userId).maybeSingle(),
    db.from('marketplace_notifications').insert({ user_id: input.userId, kind: input.kind, title: input.title, body: input.body.slice(0, 1000), href: input.href }),
  ]);
  if (preferenceError) throw preferenceError;
  if (notificationError) throw notificationError;
  if (prefs?.[input.preference] === false) return;
  if (process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT) {
    webPush.setVapidDetails(process.env.WEB_PUSH_SUBJECT, process.env.WEB_PUSH_PUBLIC_KEY, process.env.WEB_PUSH_PRIVATE_KEY);
    const { data: subscriptions, error: subscriptionError } = await db.from('marketplace_push_subscriptions')
      .select('id,endpoint,p256dh,auth').eq('user_id', input.userId);
    if (subscriptionError) throw subscriptionError;
    await Promise.all((subscriptions ?? []).map(async subscription => {
      try {
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ title: input.title, body: input.body.slice(0, 1000), href: input.href }));
      } catch (caught) {
        const statusCode = typeof caught === 'object' && caught !== null && 'statusCode' in caught
          ? Number(caught.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await db.from('marketplace_push_subscriptions').delete().eq('id', subscription.id);
          if (deleteError) console.error('Expired push subscription could not be removed:', deleteError.message);
        } else {
          console.error('Store push notification delivery failed:', caught instanceof Error ? caught.message : 'unknown error');
        }
      }
    }));
  }
  const { data } = await db.auth.admin.getUserById(input.userId);
  if (!data.user?.email) return;
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  await sendClientEmail({ to: data.user.email, subject: input.title, text: `${input.body}\n\n${origin}${input.href}` });
}
