import { adminSupabase } from '@/lib/auth';
import { sendClientEmail } from '@/lib/notifications';

export async function notifyMarketplaceUser(input: { userId: string; kind: string; title: string; body: string; href: string; preference: 'messages' | 'order_updates' | 'support_updates' }) {
  const db = adminSupabase();
  const [{ data: prefs }, { error }] = await Promise.all([
    db.from('marketplace_notification_preferences').select('messages,order_updates,support_updates').eq('user_id', input.userId).maybeSingle(),
    db.from('marketplace_notifications').insert({ user_id: input.userId, kind: input.kind, title: input.title, body: input.body.slice(0,1000), href: input.href }),
  ]);
  if (error || prefs?.[input.preference] === false) return;
  const { data } = await db.auth.admin.getUserById(input.userId);
  if (!data.user?.email) return;
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  await sendClientEmail({ to: data.user.email, subject: input.title, text: `${input.body}\n\n${origin}${input.href}` });
}
