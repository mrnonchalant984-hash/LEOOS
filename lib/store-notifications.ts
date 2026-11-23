import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/auth';
import { sendClientEmail } from '@/lib/notifications';
import webPush from 'web-push';

type NotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  preference: 'messages' | 'order_updates' | 'support_updates';
  idempotencyKey?: string;
};

async function recordDelivery(input: {
  notificationId: string; userId: string; channel: 'in_app' | 'email' | 'push';
  deliveryKey: string; status: 'pending' | 'sent' | 'failed' | 'skipped'; errorCode?: string | null;
}) {
  const db = adminSupabase();
  const { data: existing, error: lookupError } = await db.from('marketplace_notification_deliveries')
    .select('id,status,attempt_count').eq('notification_id', input.notificationId)
    .eq('delivery_key', input.deliveryKey).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.status === 'sent') return null;
  const payload = {
    notification_id: input.notificationId, user_id: input.userId, channel: input.channel,
    delivery_key: input.deliveryKey, status: input.status,
    attempt_count: (existing?.attempt_count ?? 0) + 1, error_code: input.errorCode ?? null,
    delivered_at: input.status === 'sent' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const query = existing
    ? db.from('marketplace_notification_deliveries').update(payload).eq('id', existing.id)
    : db.from('marketplace_notification_deliveries').insert(payload);
  const { data, error } = await query.select('id').single();
  if (error) throw error;
  return data?.id ?? null;
}

export async function notifyMarketplaceUser(input: NotificationInput) {
  const db = adminSupabase();
  const dedupeKey = (input.idempotencyKey || randomUUID()).slice(0, 180);
  const [{ data: prefs, error: preferenceError }, { data: profile, error: profileError }] = await Promise.all([
    db.from('marketplace_notification_preferences').select('messages,order_updates,support_updates').eq('user_id', input.userId).maybeSingle(),
    db.from('profiles').select('email_opt_out').eq('id', input.userId).maybeSingle(),
  ]);
  if (preferenceError) throw preferenceError;
  if (profileError) throw profileError;

  let notificationId: string | null = null;
  const { data: inserted, error: insertError } = await db.from('marketplace_notifications').insert({
    user_id: input.userId, kind: input.kind, title: input.title.slice(0, 160),
    body: input.body.slice(0, 1000), href: input.href, dedupe_key: dedupeKey,
  }).select('id').single();
  if (insertError?.code === '23505') {
    const { data: existing, error } = await db.from('marketplace_notifications').select('id')
      .eq('user_id', input.userId).eq('dedupe_key', dedupeKey).maybeSingle();
    if (error) throw error;
    notificationId = existing?.id ?? null;
  } else if (insertError) {
    throw insertError;
  } else {
    notificationId = inserted.id;
  }
  if (!notificationId) throw new Error('Marketplace notification could not be resolved.');

  await recordDelivery({ notificationId, userId: input.userId, channel: 'in_app', deliveryKey: 'in_app', status: 'sent' });
  if (prefs?.[input.preference] === false) {
    await recordDelivery({ notificationId, userId: input.userId, channel: 'email', deliveryKey: 'email', status: 'skipped', errorCode: 'user_preference_disabled' });
    await recordDelivery({ notificationId, userId: input.userId, channel: 'push', deliveryKey: 'push:all', status: 'skipped', errorCode: 'user_preference_disabled' });
    return;
  }

  const pushConfigured = Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT);
  if (pushConfigured) {
    webPush.setVapidDetails(process.env.WEB_PUSH_SUBJECT!, process.env.WEB_PUSH_PUBLIC_KEY!, process.env.WEB_PUSH_PRIVATE_KEY!);
    const { data: subscriptions, error: subscriptionError } = await db.from('marketplace_push_subscriptions')
      .select('id,endpoint,p256dh,auth').eq('user_id', input.userId);
    if (subscriptionError) throw subscriptionError;
    for (const subscription of subscriptions ?? []) {
      const deliveryKey = `push:${subscription.id}`;
      await recordDelivery({ notificationId, userId: input.userId, channel: 'push', deliveryKey, status: 'pending' });
      try {
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ title: input.title, body: input.body.slice(0, 1000), href: input.href }));
        await recordDelivery({ notificationId, userId: input.userId, channel: 'push', deliveryKey, status: 'sent' });
      } catch (caught) {
        const statusCode = typeof caught === 'object' && caught !== null && 'statusCode' in caught ? Number(caught.statusCode) : 0;
        const { error: deliveryError } = await db.from('marketplace_notification_deliveries')
          .update({ status: 'failed', error_code: statusCode ? `web_push_${statusCode}` : 'web_push_delivery_failed', updated_at: new Date().toISOString() })
          .eq('notification_id', notificationId).eq('delivery_key', deliveryKey);
        if (deliveryError) console.error('Push delivery status could not be recorded:', deliveryError.message);
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await db.from('marketplace_push_subscriptions').delete().eq('id', subscription.id);
          if (deleteError) console.error('Expired push subscription could not be removed:', deleteError.message);
        }
      }
    }
  } else {
    await recordDelivery({ notificationId, userId: input.userId, channel: 'push', deliveryKey: 'push:unconfigured', status: 'skipped', errorCode: 'web_push_not_configured' });
  }

  const { data: authResult, error: authError } = await db.auth.admin.getUserById(input.userId);
  if (authError) throw authError;
  if (!authResult.user?.email || profile?.email_opt_out === true) {
    await recordDelivery({ notificationId, userId: input.userId, channel: 'email', deliveryKey: 'email', status: 'skipped', errorCode: profile?.email_opt_out ? 'email_opt_out' : 'email_missing' });
    return;
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  await recordDelivery({ notificationId, userId: input.userId, channel: 'email', deliveryKey: 'email', status: 'pending' });
  const sent = await sendClientEmail({ to: authResult.user.email, subject: input.title.slice(0, 160), text: `${input.body}\n\n${origin}${input.href}` });
  await recordDelivery({
    notificationId, userId: input.userId, channel: 'email', deliveryKey: 'email',
    status: sent ? 'sent' : 'failed', errorCode: sent ? null : 'email_provider_unavailable_or_rejected',
  });
}
