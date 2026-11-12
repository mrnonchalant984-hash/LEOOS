import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request); if (!user) return NextResponse.json({ error: 'Sign in to export your data.' }, { status: 401 });
  const db = adminSupabase();
  const [profile,seller,saved,orders,items,conversations,reports,reviews,prefs,consents,notifications] = await Promise.all([
    db.from('profiles').select('id,email,full_name,created_at').eq('id',user.id).maybeSingle(),
    db.from('marketplace_sellers').select('*').eq('user_id',user.id).maybeSingle(),
    db.from('marketplace_saved_products').select('product_id,created_at').eq('user_id',user.id),
    db.from('marketplace_orders').select('id,order_number,status,currency,total_kobo,created_at,paid_at').eq('buyer_id',user.id),
    db.from('marketplace_order_items').select('order_id,title,slug,quantity,unit_price_kobo,line_total_kobo').eq('seller_id',user.id),
    db.from('marketplace_conversations').select('id,product_id,buyer_id,seller_id,created_at').or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`),
    db.from('marketplace_reports').select('id,product_id,conversation_id,reason,details,status,created_at').eq('reporter_id',user.id),
    db.from('marketplace_reviews').select('product_id,seller_id,rating,body,created_at').eq('reviewer_id',user.id),
    db.from('marketplace_notification_preferences').select('*').eq('user_id',user.id).maybeSingle(),
    db.from('marketplace_consents').select('consent_key,version,granted,created_at').eq('user_id',user.id),
    db.from('marketplace_notifications').select('kind,title,body,href,read_at,created_at').eq('user_id',user.id),
  ]);
  const convoIds = (conversations.data ?? []).map(row => row.id);
  const messageRows = convoIds.length ? await db.from('marketplace_messages').select('id,conversation_id,sender_id,body,created_at,read_at').in('conversation_id',convoIds) : { data: [], error: null };
  const result = { exportedAt: new Date().toISOString(), profile: profile.data, seller: seller.data, savedProducts: saved.data ?? [], buyerOrders: orders.data ?? [], sellerOrderItems: items.data ?? [], conversations: conversations.data ?? [], messages: messageRows.data ?? [], reports: reports.data ?? [], reviews: reviews.data ?? [], notificationPreferences: prefs.data, consents: consents.data ?? [], notifications: notifications.data ?? [] };
  return new NextResponse(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="marketplace-data-export.json"', 'Cache-Control': 'no-store, private' } });
}
