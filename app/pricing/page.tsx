"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatNairaKobo, freePlan, planConfig, type PaidPlanKey } from "@/lib/pricing";
const plans = [freePlan, ...Object.values(planConfig)];
const featureLabels: Record<string, string> = {
  chat: "Leo AI",
  "file-review": "Project file review",
  "image-generation": "Image and visual generation",
  "code-review": "Code review",
  "website-builder": "Website building",
  "web-app-builder": "Web app building",
  "saas-builder": "SaaS building",
  voice: "Leo voice",
  "agent-access": "Manual AI agent selection",
  "video-generation": "AI video generation (credit-priced)",
  "browser-automation": "Leo Workspace browser automation",
  "advertising-studio": "Advertising Studio",
};
export default function Pricing() {
  const router = useRouter();
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">(
    "monthly",
  );
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [priceState, setPriceState] = useState<"loading" | "ready" | "error">("loading");
  const [loading, setLoading] = useState("");
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
    return () => controller.abort();
  }, []);
  async function pay(plan: PaidPlanKey) {
    setLoading(plan);
    setPurchaseError("");
    try {
      const supa = (await import("@supabase/ssr")).createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await supa.auth.getSession();
      if (!data.session) {
        router.push("/auth");
        return;
      }
      const r = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          plan,
          billing_period: period,
          callback_url: `${location.origin}/payment/callback`,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || typeof d.authorization_url !== "string") {
        throw new Error(d.error || "Payment could not be started. Please try again.");
      }
      window.location.assign(d.authorization_url);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Payment could not be started. Please try again.");
    } finally {
      setLoading("");
    }
  }
  return (
    <main className="pricing-page mx-auto max-w-6xl px-4 py-16">
      <div className="pricing-intro max-w-3xl">
        <p className="text-sm font-bold text-yellow-300">LEO PLANS <span>· SIMPLE, TRANSPARENT, PREPAID</span></p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">
          Simple plans that grow with you.
        </h1>
        <p className="mt-4 text-zinc-400">
          Your plan controls project types and build capacity. Hosting is separate after each project’s 90-day trial.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          Plans are prepaid for the selected period and do not automatically renew. Choose the period that works for you.
        </p>
        <p className="mt-3 text-sm text-amber-200/80">
          Websites, web apps, and SaaS projects are available according to each plan’s listed limits.
        </p>
        <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          <p className="font-semibold text-white">50 welcome credits for new accounts</p>
          <p className="mt-1">Receive this one-time welcome bonus when you join. Your plan’s included image allowance is shown on each plan card.</p>
        </div>
      </div>
      <div className="pricing-toggle mt-8 inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1" aria-label="Billing period">
        {(["monthly", "quarterly", "yearly"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`rounded-lg px-4 py-2 text-sm ${period === p ? "active" : ""}`}
          >
            {p}
          </button>
        ))}
      </div>
      {priceState === "loading" && <p className="mt-3 text-xs text-zinc-500" aria-live="polite">Loading current prices…</p>}
      {priceState === "error" && <p className="mt-3 text-sm text-amber-200" role="alert">We couldn’t load the latest prices. Please refresh the page or contact support.</p>}
      {purchaseError && <p className="mt-3 text-sm text-red-300" role="alert">{purchaseError}</p>}
      <p className="mt-3 text-xs text-zinc-500">Quarterly and yearly prices are undiscounted totals. The full amount is charged for the selected period; plans do not auto-renew.</p>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Developer API billing is separate</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">These prices cover Leo AI and project-building subscriptions. API keys, API usage limits, and any future paid API tiers are managed separately.</p>
        </div>
        <Link href="/developers/pricing" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/[.06]">Request API access <span aria-hidden="true">→</span></Link>
      </div>
      <div className="pricing-grid mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const publicKey = p.key === "unlimited" ? "business" : p.key;
          const amount = p.key === "free" ? 0 : prices[`${publicKey}_${period}`] ?? prices[`${p.key}_${period}`];
          const priceAvailable = p.key === "free" || (typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0);
          return (
          <div
            key={p.key}
            className={`pricing-card rounded-3xl border border-zinc-800 bg-zinc-950 p-6 ${p.key === "standard" ? "featured" : ""}`}
          >
            <div className="pricing-card-top"><span>{p.key === "standard" ? "MOST POPULAR" : p.key === "free" ? "START HERE" : p.key === "unlimited" ? "FOR TEAMS" : "FOR PROFESSIONALS"}</span></div><h2 className="text-xl font-black">{p.name}</h2>
            <div className="mt-3 text-3xl font-black text-yellow-300">
              {p.key === "free"
                ? "\u20A60"
                : !priceAvailable ? "Price unavailable" : formatNairaKobo(amount as number)}
            </div>
            <p className="mt-1 text-xs text-zinc-500">{p.key === "free" ? "Free website tier" : period === "monthly" ? "per month · billed monthly" : `total billed ${period}`}</p>
            <p className="mt-3 text-sm text-zinc-400">{p.description}</p>
            <p className="mt-4 text-xs text-zinc-500">{p.limits.maxProjects} projects · {p.limits.monthlyBuilds} builds/month · {p.limits.monthlyImageCredits} image credits/month</p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-300">
              {p.features.map((feature) => (
                <li key={feature}>✓ {featureLabels[feature] || feature}</li>
              ))}
              {p.projectTypes.map((type) => <li key={type}>✓ {type.replaceAll("_", " ")} projects</li>)}
            </ul>
            {p.key === "free" ? (
              <Link href="/auth?next=%2Fdashboard" className="mt-7 block rounded-xl bg-yellow-400 px-4 py-3 text-center font-bold text-black">Create free account</Link>
            ) : (
              <Button disabled={!priceAvailable || !!loading || priceState !== "ready"} onClick={() => pay(p.key as PaidPlanKey)} className="mt-7 w-full">
                {loading === p.key ? "Opening payment…" : "Choose " + p.name}
              </Button>
            )}
          </div>
          );
        })}
      </div>
    </main>
  );
}
