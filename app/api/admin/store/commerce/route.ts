import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, requireOwner } from '@/lib/auth';
import { getStoreSettlementStatus } from '@/lib/store/settlement-provider';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const owner = await requireOwner(request); if (!owner) return NextResponse.json({ error: 'Owner access with a trusted device is required.' }, { status: 403 });
  const db = adminSupabase();
  const [orders, payouts, commissions, supplierJobs, suppliers, affiliates] = await Promise.all([
    db.from('marketplace_orders').select('id,order_number,buyer_id,status,total_kobo,currency,created_at,paid_at').order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_seller_payouts').select('id,order_id,seller_id,gross_kobo,commission_kobo,net_kobo,status,reference,created_at,updated_at').order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_affiliate_commissions').select('id,order_id,affiliate_id,basis_kobo,commission_kobo,status,eligible_at,paid_at,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_supplier_fulfillment_requests').select('id,order_id,seller_id,supplier_id,quantity,status,last_error,tracking_reference,created_at,updated_at').order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_suppliers').select('user_id,business_name,country_code,verification_status,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('marketplace_affiliates').select('user_id,referral_code,status,commission_bps,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  const failed = [orders,payouts,commissions,supplierJobs,suppliers,affiliates].some(result => result.error);
  if (failed) return NextResponse.json({ error: 'Commerce operations data is unavailable. Confirm the latest LeoX Store migrations are applied.' }, { status: 503 });
  const orderRows = orders.data ?? [];
  const totals = {
    orders: orderRows.length,
    paidOrders: orderRows.filter(item => item.status === 'paid').length,
    grossPaidKobo: orderRows.filter(item => item.status === 'paid').reduce((sum,item) => sum + Number(item.total_kobo || 0), 0),
    payoutPending: (payouts.data ?? []).filter(item => item.status === 'pending' || item.status === 'initiating').length,
    payoutFailed: (payouts.data ?? []).filter(item => item.status === 'failed').length,
    affiliatePending: (commissions.data ?? []).filter(item => item.status === 'pending' || item.status === 'eligible').length,
    supplierAttention: (supplierJobs.data ?? []).filter(item => ['failed','rejected'].includes(item.status)).length,
  };
  return NextResponse.json({ totals, orders: orderRows, payouts: payouts.data ?? [], commissions: commissions.data ?? [], supplierFulfillments: supplierJobs.data ?? [], suppliers: suppliers.data ?? [], affiliates: affiliates.data ?? [], settlement: { ...getStoreSettlementStatus(), note: 'This environment does not operate a LeonardX-held wallet or escrow account.' } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
