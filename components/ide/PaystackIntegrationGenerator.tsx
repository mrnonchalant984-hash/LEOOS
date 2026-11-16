"use client";
import { useState } from "react";

const snippets: Record<string, string> = {
  "app/api/paystack/initialize/route.ts": [
    'import { NextRequest, NextResponse } from "next/server";',
    'import { randomUUID } from "node:crypto";',
    'import { getProfile, adminSupabase } from "@/lib/auth";',
    'export const runtime = "nodejs";',
    'export async function POST(req: NextRequest) {',
    '  const ctx = await getProfile(req);',
    '  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });',
    '  if (!ctx.user.email || !process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_SITE_URL) return NextResponse.json({ error: "Checkout is not configured." }, { status: 503 });',
    '  const body = await req.json().catch(() => null); const amountKobo = Number(body?.amountKobo);',
    '  if (!Number.isSafeInteger(amountKobo) || amountKobo < 100) return NextResponse.json({ error: "Invalid amount." }, { status: 400 });',
    '  const reference = "lx_" + randomUUID().replaceAll("-", ""); const db = adminSupabase();',
    '  const { error } = await db.from("project_payments").insert({ user_id: ctx.user.id, reference, amount_kobo: amountKobo, currency: "NGN", status: "pending" });',
    '  if (error) return NextResponse.json({ error: "Could not register checkout." }, { status: 503 });',
    '  const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: ctx.user.email, amount: amountKobo, reference, callback_url: process.env.NEXT_PUBLIC_SITE_URL + "/payment/callback", metadata: { user_id: ctx.user.id } }), cache: "no-store", signal: AbortSignal.timeout(10000) });',
    '  const result = await response.json().catch(() => null);',
    '  if (!response.ok || !result?.status || typeof result?.data?.authorization_url !== "string") { await db.from("project_payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending"); return NextResponse.json({ error: "Paystack checkout failed." }, { status: 502 }); }',
    '  return NextResponse.json({ authorization_url: result.data.authorization_url, reference }, { headers: { "Cache-Control": "no-store" } });',
    '}'
  ].join("\n"),
  "app/api/paystack/webhook/route.ts": [
    'import { createHmac, timingSafeEqual } from "node:crypto";',
    'import { NextRequest, NextResponse } from "next/server";',
    'import { adminSupabase } from "@/lib/auth";',
    'import { verifyPaystackTransaction } from "@/lib/payments";',
    'export const runtime = "nodejs";',
    'export async function POST(req: NextRequest) {',
    '  const raw = await req.text(); if (raw.length > 256000) return NextResponse.json({ error: "Payload too large." }, { status: 413 });',
    '  const secret = process.env.PAYSTACK_SECRET_KEY, signature = req.headers.get("x-paystack-signature") || "";',
    '  if (!secret || !/^[a-f0-9]{128}$/i.test(signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });',
    '  const expected = createHmac("sha512", secret).update(raw).digest(), supplied = Buffer.from(signature, "hex");',
    '  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });',
    '  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string } };',
    '  if (event.event !== "charge.success" || !event.data?.reference) return NextResponse.json({ received: true });',
    '  const reference = event.data.reference, db = adminSupabase();',
    '  const { data: payment, error } = await db.from("project_payments").select("user_id,amount_kobo,currency,status").eq("reference", reference).maybeSingle();',
    '  if (error) return NextResponse.json({ error: "Payment record unavailable." }, { status: 503 });',
    '  if (!payment) return NextResponse.json({ error: "Unknown reference." }, { status: 404 });',
    '  if (payment.status === "succeeded") return NextResponse.json({ received: true, idempotent: true });',
    '  if (payment.status !== "pending") return NextResponse.json({ error: "Payment is not pending." }, { status: 409 });',
    '  let tx; try { tx = await verifyPaystackTransaction(reference); } catch { return NextResponse.json({ error: "Verification failed." }, { status: 409 }); }',
    '  const metadata = typeof tx.metadata === "object" && tx.metadata ? tx.metadata as Record<string, unknown> : {};',
    '  if (Number(tx.amount) !== Number(payment.amount_kobo) || String(tx.currency).toUpperCase() !== String(payment.currency).toUpperCase() || String(metadata.user_id || "") !== payment.user_id) return NextResponse.json({ error: "Payment does not match registered order." }, { status: 409 });',
    '  const { data, error: applyError } = await db.rpc("apply_project_paystack_payment", { p_reference: reference, p_paid_at: tx.paid_at || new Date().toISOString() });',
    '  if (applyError) return NextResponse.json({ error: "Payment verified but fulfillment is not recorded." }, { status: 503 });',
    '  return NextResponse.json({ received: true, applied: data !== false });',
    '}'
  ].join("\n"),
  "components/PaystackCheckoutButton.tsx": [
    '"use client"; import { useState } from "react";',
    'export function PaystackCheckoutButton({ amountKobo }: { amountKobo: number }) {',
    '  const [busy, setBusy] = useState(false), [error, setError] = useState("");',
    '  async function checkout() { setBusy(true); setError(""); try {',
    '    const response = await fetch("/api/paystack/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountKobo }) });',
    '    const data = await response.json(); if (!response.ok || typeof data.authorization_url !== "string") throw new Error(data.error || "Checkout unavailable.");',
    '    window.location.assign(data.authorization_url);',
    '  } catch (cause) { setError(cause instanceof Error ? cause.message : "Checkout failed."); setBusy(false); } }',
    '  return <div><button type="button" onClick={checkout} disabled={busy || !Number.isSafeInteger(amountKobo) || amountKobo < 100}>{busy ? "Opening checkout…" : "Pay with Paystack"}</button>{error && <p role="alert">{error}</p>}</div>;',
    '}'
  ].join("\n"),
  "docs/PAYSTACK_PROJECT_INTEGRATION.md": "# Paystack project integration\n\nSet PAYSTACK_SECRET_KEY (server-only) and NEXT_PUBLIC_SITE_URL (HTTPS). Create project_payments with unique reference, user_id, amount_kobo, currency and status. Implement apply_project_paystack_payment as a service-role-only SECURITY DEFINER RPC with fixed search_path, row locking, pending-to-succeeded transition and idempotent fulfillment. Configure the webhook URL in Paystack. The generated webhook validates signature, then independently verifies transaction reference, owner, amount and currency before calling the RPC. Review and adapt fulfillment to your order model before live use.\n"
};

export function PaystackIntegrationGenerator({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  async function generate() {
    setBusy(true); setStatus("");
    try {
      const url = "/api/workspaces/" + encodeURIComponent(workspaceId) + "/files";
      const response = await fetch(url, { cache: "no-store" }), current = await response.json();
      if (!response.ok || !current.data?.files) throw new Error(current.error || "Could not read workspace.");
      const conflicts = Object.keys(snippets).filter(path => path in current.data.files);
      if (conflicts.length) throw new Error("No files were overwritten. Existing paths: " + conflicts.join(", "));
      const saved = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: { ...current.data.files, ...snippets } }) });
      const result = await saved.json(); if (!saved.ok) throw new Error(result.error || "Could not save generated files.");
      setStatus("Added Paystack source files. Complete the documented database prerequisites and review the generated fulfillment RPC before live payments.");
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Could not generate files."); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto mb-4 max-w-[1600px] rounded-xl border border-white/10 bg-[#101114] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Paystack integration generator</h2><p className="mt-1 text-xs text-white/55">Generate checkout, signed webhook verification and client integration files in this project.</p></div><button type="button" onClick={() => setOpen(value => !value)} className="rounded-md border border-[#d7aa70]/40 px-3 py-2 text-sm text-[#f1c894]">{open ? "Close" : "Configure"}</button></div>
    {open && <div className="mt-4"><p className="text-xs leading-5 text-white/50">Creates four project files. It does not overwrite existing files, configure live credentials, or activate payments. A database table and idempotent service-role fulfillment RPC are required.</p><button type="button" onClick={() => void generate()} disabled={busy} className="mt-3 rounded-md bg-[#d7aa70] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? "Generating…" : "Add Paystack files to project"}</button>{status && <p role="status" className="mt-3 text-xs leading-5 text-[#f1c894]">{status}</p>}</div>}
  </section>;
}
