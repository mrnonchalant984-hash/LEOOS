import { getAdminSupabase } from "@/lib/auth";

export async function verifyAndApplyPaystack(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");

  const admin = getAdminSupabase();
  const check = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
    },
  );
  const result = await check.json();
  if (!check.ok || result.data?.status !== "success") {
    if (["failed", "abandoned"].includes(result.data?.status)) {
      const { error: updateError } = await admin
        .from("payments")
        .update({ status: "failed", verified_at: new Date().toISOString() })
        .eq("reference", reference)
        .eq("status", "pending");
      if (updateError) throw updateError;
    }
    throw new Error(result.message || "Payment could not be verified");
  }

  const tx = result.data;
  if (String(tx.reference) !== reference)
    throw new Error("Verified payment reference does not match");
  const { data: payment, error } = await admin
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw error;
  if (!payment) throw new Error("Payment reference is not registered");
  if (payment.amount_kobo !== Number(tx.amount))
    throw new Error("Verified amount does not match the registered purchase");
  if (tx.metadata?.user_id && String(tx.metadata.user_id) !== payment.user_id)
    throw new Error("Verified payment owner does not match the registered purchase");
  if (tx.metadata?.plan && String(tx.metadata.plan) !== payment.plan)
    throw new Error("Verified plan does not match the registered purchase");
  if (
    tx.metadata?.billing_period &&
    String(tx.metadata.billing_period) !== payment.billing_period
  )
    throw new Error("Verified billing period does not match the registered purchase");

  const paidAt = tx.paid_at ? new Date(tx.paid_at).toISOString() : new Date().toISOString();
  const { data: applied, error: applyError } = await admin.rpc(
    "apply_verified_subscription_payment",
    { p_reference: reference, p_paid_at: paidAt },
  );
  if (applyError) throw applyError;

  return { userId: payment.user_id, reference, alreadyApplied: applied === false };
}
