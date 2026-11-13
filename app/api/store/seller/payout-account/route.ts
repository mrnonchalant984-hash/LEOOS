import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getUserFromRequest } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { requireVerifiedStoreSeller } from '@/lib/store/seller-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view payout settings.' }, { status: 401 });
  const db = adminSupabase();
  const [{ data, error }, { data: payouts, error: payoutError }] = await Promise.all([
    db.from('marketplace_seller_payout_accounts').select('bank_code,account_name,account_last4,updated_at').eq('seller_id', user.id).maybeSingle(),
    db.from('marketplace_seller_payouts').select('order_id,gross_kobo,delivery_kobo,commission_kobo,net_kobo,status,created_at').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(50),
  ]);
  if (error || payoutError) return NextResponse.json({ error: 'Payout settings are unavailable.' }, { status: 503 });
  return NextResponse.json({ account: data ?? null, payouts: payouts ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 });
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in to configure payouts.' }, { status: 401 });
  const blocked = await requireVerifiedStoreSeller(user.id);
  if (blocked) return blocked;
  if (process.env.STORE_PAYOUTS_ENABLED !== 'true') return NextResponse.json({ error: 'Seller payouts are not enabled for this environment.' }, { status: 503 });
  const limited = await enforceUserRateLimit(user.id, 'store-payout-account', 5, 3600);
  if (limited) return limited;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Paystack payouts are not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null) as { bankCode?: unknown; accountNumber?: unknown; accountName?: unknown } | null;
  const bankCode = typeof body?.bankCode === 'string' ? body.bankCode.trim() : '';
  const accountNumber = typeof body?.accountNumber === 'string' ? body.accountNumber.trim() : '';
  const accountName = typeof body?.accountName === 'string' ? body.accountName.trim() : '';
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(bankCode) || !/^\d{10}$/.test(accountNumber)
    || accountName.length < 2 || accountName.length > 120) {
    return NextResponse.json({ error: 'Enter a bank code, 10-digit account number, and account name.' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nuban', name: accountName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => null);
    const recipientCode = result?.data?.recipient_code;
    if (!response.ok || result?.status !== true || typeof recipientCode !== 'string') {
      return NextResponse.json({ error: 'Paystack could not verify this payout destination. Check the bank details and try again.' }, { status: 422 });
    }
    const bankDetails = result.data.details;
    const verifiedName = typeof bankDetails?.account_name === 'string' ? bankDetails.account_name.trim() : '';
    const verifiedNumber = typeof bankDetails?.account_number === 'string' ? bankDetails.account_number.replace(/\D/g, '') : '';
    const verifiedBankCode = typeof bankDetails?.bank_code === 'string' ? bankDetails.bank_code : '';
    if (!verifiedName || !verifiedNumber.endsWith(accountNumber.slice(-4)) || verifiedBankCode !== bankCode) {
      return NextResponse.json({ error: 'Paystack could not confirm the account name, number, and bank. Check the details and try again.' }, { status: 422 });
    }
    let subaccountCode: string | null = null;
    if (process.env.STORE_PAYSTACK_SPLIT_ENABLED === 'true') {
      const { data: existingAccount } = await adminSupabase().from('marketplace_seller_payout_accounts').select('subaccount_code,bank_code,account_last4').eq('seller_id', user.id).maybeSingle();
      if (existingAccount?.subaccount_code && existingAccount.bank_code === bankCode && existingAccount.account_last4 === accountNumber.slice(-4)) subaccountCode = existingAccount.subaccount_code;
      if (!subaccountCode) {
      const splitResponse = await fetch('https://api.paystack.co/subaccount', {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: verifiedName, settlement_bank: bankCode, account_number: accountNumber, percentage_charge: 0, primary_contact_email: user.email ?? undefined }),
        cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      const splitResult = await splitResponse.json().catch(() => null);
      if (!splitResponse.ok || splitResult?.status !== true || typeof splitResult?.data?.subaccount_code !== 'string') {
        return NextResponse.json({ error: 'Paystack verified the bank account but could not create its marketplace subaccount. Split settlement was not enabled.' }, { status: 422 });
      }
      subaccountCode = splitResult.data.subaccount_code;
      }
    }
    const { data, error } = await adminSupabase().from('marketplace_seller_payout_accounts')
      .upsert({ seller_id: user.id, recipient_code: recipientCode, subaccount_code: subaccountCode, bank_code: bankCode, account_name: verifiedName, account_last4: accountNumber.slice(-4), updated_at: new Date().toISOString() }, { onConflict: 'seller_id' })
      .select('bank_code,account_name,account_last4,subaccount_code,updated_at').single();
    if (error) return NextResponse.json({ error: 'Payout destination could not be saved.' }, { status: 503 });
    return NextResponse.json({ account: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Paystack could not be reached. Payout settings were not changed.' }, { status: 502 });
  }
}
