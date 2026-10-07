import { adminSupabase } from "./auth";
import { getEffectiveUserPlan, planAllows } from "./plan-access";
export const CREDIT_COST: Record<string, number> = {
  image_generation: 1,
  code_generation: 1,
  background_removal: 1,
  website_deployment: 3,
};
export async function accountAccess(userId: string, feature: string) {
  const db = adminSupabase();
  const { data: profile } = await db
    .from("profiles")
    .select("role,email")
    .eq("id", userId)
    .single();
  if (
    profile?.role === "owner" &&
    profile.email?.toLowerCase() ===
      (process.env.OWNER_EMAIL || "leonardudoh5@gmail.com").toLowerCase()
  )
    return { allowed: true, owner: true, credits: null };
  const plan = await getEffectiveUserPlan(userId);
  const planFeature = feature.replaceAll("_", "-");
  const entitled = planAllows(plan, planFeature);
  const monthlyAllowance =
    feature === "image_generation" ? plan.limits.monthlyImageCredits : 0;
  const cost = CREDIT_COST[feature] || 1;
  const { data: credit } = await db
    .from("credits")
    .select("credits_remaining,last_reset")
    .eq("user_id", userId)
    .eq("feature", feature)
    .maybeSingle();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const creditRefreshDue = monthlyAllowance > 0 && (!credit || new Date(credit.last_reset) < monthStart);
  const storedCredits = credit?.credits_remaining || 0;
  const credits = monthlyAllowance > 0
    ? creditRefreshDue ? monthlyAllowance : Math.min(storedCredits, monthlyAllowance)
    : storedCredits;
  return {
    allowed: (entitled || monthlyAllowance > 0) && credits >= cost,
    owner: false,
    credits,
    plan: plan.key,
    entitled: entitled || monthlyAllowance > 0,
    monthlyAllowance,
  };
}
export async function consumeCredit(userId: string, feature: string) {
  const db = adminSupabase();
  const a = await accountAccess(userId, feature);
  if (a.owner) {
    await db
      .from("ai_usage")
      .insert({
        user_id: userId,
        feature,
        model: null,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        credits_used: 0,
        metadata: { source: "owner_usage" },
      });
    return a;
  }
  if (!a.allowed)
    throw new Error("No credits left or an active plan is required.");
  const cost = CREDIT_COST[feature] || 1;
  const { data: remaining, error } = await db.rpc("consume_user_credit", {
    p_user_id: userId,
    p_feature: feature,
    p_cost: cost,
    p_entitled: a.entitled,
    p_free_monthly_allowance: a.monthlyAllowance,
  });
  if (error) throw new Error(error.message || "No credits left or an active plan is required.");
  await db
    .from("ai_usage")
    .insert({
      user_id: userId,
      feature,
      model: null,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      credits_used: cost,
      metadata: { source: "credit_consumption" },
    });
  return { remaining };
}
