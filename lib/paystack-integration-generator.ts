export type PaystackProjectFiles = Record<string, string>;

export function generatePaystackIntegrationFiles(useSrcDirectory = false): PaystackProjectFiles {
  const appRoot = useSrcDirectory ? 'src/app' : 'app';
  const libRoot = useSrcDirectory ? 'src/lib' : 'lib';
  return {
    [libRoot + "/paystack.ts"]: \`const PAYSTACK_API = "https://api.paystack.co";

export async function initializePaystackTransaction(input: {
  email: string; amountKobo: number; reference: string; callbackUrl: string;
}) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo < 100) throw new Error("Invalid amount in kobo");
  const response = await fetch(\`\${PAYSTACK_API}/transaction/initialize\`, {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, amount: input.amountKobo, reference: input.reference, callback_url: input.callbackUrl }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.status || !result.data?.authorization_url) throw new Error("Paystack initialization failed");
  return { authorizationUrl: result.data.authorization_url as string, reference: result.data.reference as string };
}

export async function verifyPaystackTransaction(reference: string) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const response = await fetch(\`\${PAYSTACK_API}/transaction/verify/\${encodeURIComponent(reference)}\`, {
    headers: { Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\` }, cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.status || result.data?.status !== "success") throw new Error("Payment not verified");
  return result.data as { status: string; reference: string; amount: number; currency: string; paid_at: string; customer: { email: string } };
}
\`,
    [appRoot + "/api/payments/initialize/route.ts"]: \`import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { initializePaystackTransaction } from "@/lib/paystack";

export const runtime = "nodejs";

// Replace this example with an authenticated, server-owned order lookup.
// Never accept an amount or product price from the browser.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!email || !orderId) return NextResponse.json({ error: "Email and orderId are required." }, { status: 400 });

  // TODO: Load the order for the authenticated user and derive its amount from your database.
  const amountKobo = 50000; // Example only: ₦500.00. Replace before use.
  const reference = \`order_\${randomUUID().replaceAll("-", "")}\`;
  try {
    const checkout = await initializePaystackTransaction({
      email, amountKobo, reference,
      callbackUrl: new URL("/payment/callback", request.url).toString(),
    });
    return NextResponse.json(checkout, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Checkout could not be initialized." }, { status: 502 });
  }
}
\`,
    [appRoot + "/api/payments/verify/route.ts"]: \`import { NextRequest, NextResponse } from "next/server";
import { verifyPaystackTransaction } from "@/lib/paystack";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  if (!reference || reference.length > 120) return NextResponse.json({ error: "A valid reference is required." }, { status: 400 });
  try {
    const payment = await verifyPaystackTransaction(reference);
    // TODO: Match reference, expected amount, currency, customer and pending order
    // against your database, then fulfill atomically and idempotently.
    return NextResponse.json({ verified: true, reference: payment.reference, amount: payment.amount, currency: payment.currency });
  } catch {
    return NextResponse.json({ error: "Payment is not verified." }, { status: 402 });
  }
}
\`,
    [appRoot + "/api/payments/webhook/route.ts"]: \`import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !/^[a-f0-9]{128}$/i.test(signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  const event = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
  if (event.event === "charge.success" && event.data?.reference) {
    // Verify the transaction with Paystack, match it to a pending order,
    // and fulfill via an idempotent database transaction. Never trust webhook
    // event fields alone to grant goods, credits, or access.
  }
  return NextResponse.json({ received: true });
}
\`,
    ".env.example": \`# Server only. Never prefix this secret with NEXT_PUBLIC_.
PAYSTACK_SECRET_KEY=sk_test_replace_me
NEXT_PUBLIC_SITE_URL=http://localhost:3000
\`,
    "PAYSTACK-INTEGRATION.md": \`# Paystack integration starter

## Setup
1. Add PAYSTACK_SECRET_KEY to your server environment. Start with a Paystack test key.
2. Replace the example order lookup and amount in the initialize route with an authenticated database lookup and server-calculated price.
3. Persist a unique pending payment reference before redirecting to Paystack.
4. In verify and webhook handlers, compare reference, exact amount, currency, customer and pending order against your database.
5. Fulfill an order only once, using an atomic database transaction or RPC and a unique reference/idempotency constraint.
6. Test success, failure, abandoned checkout, duplicate webhook, wrong amount and wrong currency cases before using live keys.

## Routes
- POST /api/payments/initialize
- POST /api/payments/verify
- POST /api/payments/webhook

The amount is illustrative and must be replaced before use. TODOs are deliberate: authentication, schema and fulfillment rules are project-specific and must not be guessed by a generator.
\`,
  };
}
