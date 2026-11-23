export type SellerVerificationRiskInput = {
  emailConfirmed: boolean;
  accountAgeDays: number;
  businessName: string;
  details: string;
  duplicateBusiness: boolean;
};

export function scoreSellerVerificationRisk(input: SellerVerificationRiskInput) {
  const signals: string[] = [];
  let score = 0;
  if (!input.emailConfirmed) { score += 80; signals.push('email_not_confirmed'); }
  if (!Number.isFinite(input.accountAgeDays) || input.accountAgeDays < 7) { score += 30; signals.push('account_younger_than_7_days'); }
  if (input.details.trim().length < 120) { score += 25; signals.push('business_context_incomplete'); }
  if (/https?:\/\/|www\./i.test(input.businessName + ' ' + input.details)) { score += 20; signals.push('external_link_requires_review'); }
  if (input.duplicateBusiness) { score += 70; signals.push('possible_duplicate_business'); }
  const riskScore = Math.min(100, score);
  return {
    riskScore,
    signals,
    outcome: riskScore === 0 && input.emailConfirmed && input.accountAgeDays >= 7 ? 'auto_approved' as const : 'manual_review' as const,
  };
}
