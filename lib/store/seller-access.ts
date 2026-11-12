import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/auth';

export async function getVerifiedStoreSellerIds(): Promise<string[] | null> {
  const db = adminSupabase();
  const sellerIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('marketplace_sellers')
      .select('user_id')
      .eq('is_verified', true)
      .range(from, from + 999);
    if (error) {
      console.error('Verified seller lookup failed:', error.message);
      return null;
    }
    sellerIds.push(...(data ?? []).map((seller) => seller.user_id));
    if ((data?.length ?? 0) < 1000) return sellerIds;
  }
}

export async function requireVerifiedStoreSeller(userId: string): Promise<NextResponse | null> {
  const { data, error } = await adminSupabase()
    .from('marketplace_sellers')
    .select('is_verified')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Seller verification lookup failed:', error.message);
    return NextResponse.json({ error: 'Seller verification status is unavailable.' }, { status: 503 });
  }
  if (!data?.is_verified) {
    return NextResponse.json(
      { error: 'Complete seller verification before creating or managing listings.', verificationRequired: true },
      { status: 403 },
    );
  }
  return null;
}
