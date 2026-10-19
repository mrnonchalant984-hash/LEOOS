"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import {
  BILLING_PERIODS,
  formatNairaKobo,
  freePlan,
  planConfig,
  PUBLIC_PAID_PLAN_KEYS,
  publicPlanToInternal,
  type BillingPeriod,
  type PublicPaidPlanKey,
} from "@/lib/pricing";

const featureLabels: Record<string, string> = {
  chat: "Leo AI workspace",
  "file-review": "Project file review",
  "image-generation": "Image generation",
  "code-review": "Code review",
  "website-builder": "Website builder",
  "web-app-builder": "Web app builder",
  "saas-builder": "SaaS builder",
  voice: "Voice interaction",
  "agent-access": "AI agent access",
  "video-generation": "AI video generation",
  "browser-automation": "Browser automation",
  "advertising-studio": "Advertising Studio",
};

const periodLabels: Record<BillingPeriod, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const periodMonths: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export default function Pricing() {
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [priceState, setPriceState] = useState<"loading" | "ready" | "error">("loading");
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState<PublicPaidPlanKey | "free" | "">("");
  const [purchaseError, setPurchaseError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/pricing", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Pricing could not be loaded.");
        const data = await response.json();
        if (data.currency !== "NGN" || !data.prices || typeof data.prices !== "object") {
          throw new Error("Pricing response is invalid.");
        }
        return data.prices as Record<string, number | null>;
      })
      .then((nextPrices) => {
        setPrices(nextPrices);
        setPriceState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPrices({});
          setPriceState("error");
        }
      });

    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Account state could not be checked.");
        return response.json();
      })
      .then((data) => setAuthenticated(data.authenticated === true))
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthChecked(true);
      });

    return () => controller.abort();
  }, []);

  async function pay(plan: PublicPaidPlanKey) {
    setLoading(plan);
    setPurchaseError("");
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Authentication is not configured. Please contact support.");
      }
      const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        router.push(`/auth?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      const response = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ plan, billing_period: period }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.push(`/auth?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      if (!response.ok || typeof result.authorization_url !== "string") {
        throw new Error(result.error || "Payment could not be started. Please try again.");
      }
      window.location.assign(result.authorization_url);
    } catch (error) {
      setPurchaseError(error instanceof Error
        ? error.message
        : "Payment could not be started. Please try again.");
    } finally {
      setLoading("");
    }
  }

  const displayedPeriod = period === "monthly"
    ? "Billed monthly"
    : period === "quarterly" ? "Billed every 3 months" : "Billed yearly";

  return (
    <main className="pricing-page mx-auto max-w-7xl px-4 py-14 sm:py-20">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-400">
          LeonardX plans <span aria-hidden="true">·</span> prepaid, transparent pricing
        </p>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
          Build at your pace.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
          Choose the project capacity and tools that fit your work. Your plan is prepaid for the selected period and never auto-renews.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-400">
          <ShieldCheck aria-hidden="true" size={16} />
          Secure checkout with Paystack. Plan access follows verified payment.
        </div>

        <div
          className="pricing-toggle mx-auto mt-8 inline-flex w-full max-w-md rounded-xl border border-white/10 bg-white/[.03] p-1"
          role="group"
          aria-label="Billing period"
        >
          {BILLING_PERIODS.map((billingPeriod) => (
            <button
              key={billingPeriod}
              type="button"
              onClick={() => setPeriod(billingPeriod)}
              aria-pressed={period === billingPeriod}
              className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                period === billingPeriod
                  ? "active"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {periodLabels[billingPeriod]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500" aria-live="polite">
          {displayedPeriod}. The full selected-period amount is charged at checkout.
        </p>
      </header>

      {priceState === "loading" && (
        <p className="mt-8 text-center text-sm text-zinc-400" role="status">
          Loading current prices…
        </p>
      )}
      {priceState === "error" && (
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-amber-200" role="alert">
          We couldn’t load current prices. Please refresh the page or contact support.
        </p>
      )}
      {purchaseError && (
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-red-300" role="alert">
          {purchaseError}
        </p>
      )}

      <div className="pricing-grid mx-auto mt-9 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PUBLIC_PAID_PLAN_KEYS.map((publicKey) => {
          const plan = planConfig[publicPlanToInternal[publicKey]];
          const amount = prices[`${publicKey}_${period}`];
          const monthlyAmount = prices[`${publicKey}_monthly`];
          const priceAvailable = typeof amount === "number" &&
            Number.isSafeInteger(amount) && amount > 0;
          const expectedTotal = typeof monthlyAmount === "number"
            ? monthlyAmount * periodMonths[period]
            : null;
          const savings = expectedTotal !== null && priceAvailable
            ? expectedTotal - amount
            : 0;
          const savingsPercent = savings > 0 && expectedTotal
            ? Math.round((savings / expectedTotal) * 100)
            : 0;
          const recommended = publicKey === "standard";

          return (
            <article
              key={publicKey}
              className={`pricing-card flex flex-col rounded-2xl border p-6 sm:p-7 ${
                recommended ? "featured" : ""
              }`}
            >
              <div className="pricing-card-top flex items-center justify-between gap-3">
                <span>{recommended ? "RECOMMENDED" : "LEONARDX PLAN"}</span>
                {savingsPercent > 0 && (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold tracking-normal text-emerald-200">
                    Save {savingsPercent}%
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">{plan.name}</h2>
              <p className="mt-2 min-h-14 text-sm leading-6 text-zinc-400">{plan.description}</p>

              <div className="mt-6">
                <p className="text-4xl font-black tracking-tight text-white">
                  {priceState === "loading"
                    ? "—"
                    : priceAvailable ? formatNairaKobo(amount) : "Price unavailable"}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {period === "monthly" ? "for 1 month" : `total for ${periodMonths[period]} months`}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{displayedPeriod}</p>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-4 text-center">
                <div>
                  <p className="text-lg font-bold text-white">{plan.limits.maxProjects}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Projects</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{plan.limits.monthlyBuilds}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Builds / mo</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{plan.limits.monthlyImageCredits}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Image credits / mo</p>
                </div>
              </div>

              <ul className="mt-5 grid flex-1 content-start gap-3 text-sm text-zinc-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-zinc-100" />
                    <span>{featureLabels[feature] || feature}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2.5 border-t border-white/10 pt-3 text-zinc-400">
                  <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-zinc-500" />
                  <span>{plan.projectTypes.map((type) => type.replaceAll("_", " ")).join(", ")} projects</span>
                </li>
              </ul>

              <button
                type="button"
                disabled={!priceAvailable || priceState !== "ready" || !!loading || !authChecked}
                onClick={() => void pay(publicKey)}
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading === publicKey
                  ? "Opening secure checkout…"
                  : authChecked && !authenticated
                    ? `Sign in to choose ${plan.name}`
                    : `Choose ${plan.name}`}
                {loading !== publicKey && <ArrowRight aria-hidden="true" size={16} />}
              </button>
              <p className="mt-3 text-center text-xs text-zinc-500">
                {authChecked && !authenticated
                  ? "You’ll sign in before checkout."
                  : "Payment is verified before plan access is updated."}
              </p>
            </article>
          );
        })}
      </div>

      <section className="mx-auto mt-8 max-w-6xl rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-400">Start free</p>
          <h2 className="mt-2 text-xl font-bold">{freePlan.name} plan</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            {freePlan.description} Includes {freePlan.limits.maxProjects} project, {freePlan.limits.monthlyBuilds} build per month, and {freePlan.limits.monthlyImageCredits} image credit per month.
          </p>
        </div>
        <Link
          href="/auth?next=%2Fdashboard"
          className="mt-5 inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:mt-0 sm:w-auto"
        >
          Create free account <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <div className="mx-auto mt-7 flex max-w-6xl flex-col gap-4 rounded-2xl border border-white/10 bg-white/[.02] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-semibold text-white">Developer API billing is separate</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
            These prices cover Leo AI and project-building subscriptions. API keys and API usage are managed separately.
          </p>
        </div>
        <Link
          href="/developers/pricing"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/[.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Developer API plans <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </div>
      <p className="mx-auto mt-5 max-w-6xl text-xs leading-5 text-zinc-500">
        Quarterly and yearly totals are calculated against the configured monthly prices. Any displayed savings are calculated from those current prices. Plans are prepaid, do not auto-renew, and unlock only after Paystack confirms payment. Hosting is separate after each eligible project’s 90-day trial.
      </p>
    </main>
  );
}
