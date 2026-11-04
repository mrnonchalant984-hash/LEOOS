export const DONATION_MIN_KOBO = 10_000;
export const DONATION_MAX_KOBO = 500_000_000;

export function parseDonationAmount(input: unknown) {
  const amountNaira = typeof input === 'number'
    ? input
    : typeof input === 'string' && /^\d+$/.test(input.trim())
      ? Number(input.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(amountNaira)) return null;
  const amountKobo = amountNaira * 100;
  return Number.isSafeInteger(amountKobo)
    && amountKobo >= DONATION_MIN_KOBO
    && amountKobo <= DONATION_MAX_KOBO
    ? amountKobo
    : null;
}
