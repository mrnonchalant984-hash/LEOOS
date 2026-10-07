"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { freePlan, planConfig, type PaidPlanKey } from "@/lib/pricing";
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
};
export default function Pricing() {
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">(
    "monthly",
  );
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState("");
  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d) => setPrices(d.prices || {}))
      .catch(() => setPrices({}));
  }, []);
  async function pay(plan: PaidPlanKey) {
    setLoading(plan);
    try {
      const supa = (await import("@supabase/ssr")).createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await supa.auth.getSession();
      if (!data.session) {
        location.href = "/auth";
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
      const d = await r.json();
      if (d.authorization_url) location.href = d.authorization_url;
      else alert(d.error || "Payment is not configured.");
    } finally {
      setLoading("");
    }
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-bold text-yellow-300">LEO PLANS</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">
          Simple plans that grow with you.
        </h1>
        <p className="mt-4 text-zinc-400">
          Your plan controls project types and build capacity. Hosting is separate after each project’s 90-day trial.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          Plans are prepaid for the selected period and do not automatically renew. Purchase another period to continue paid access.
        </p>
        <p className="mt-3 text-sm text-amber-200/80">
          Mobile builds are unavailable until Expo/EAS is integrated. Game builds are unavailable until a Godot build provider is integrated.
        </p>
      </div>
      <div className="mt-8 inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
        {(["monthly", "quarterly", "yearly"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-2 text-sm ${period === p ? "bg-yellow-400 text-black font-bold" : ""}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.key}
            className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <h2 className="text-xl font-black">{p.name}</h2>
            <div className="mt-3 text-3xl font-black text-yellow-300">
              {p.key === "free"
                ? "₦0"
                : prices[`${p.key}_${period}`]
                  ? `₦${(prices[`${p.key}_${period}`]! / 100).toLocaleString("en-NG")}`
                  : "Price not configured"}
            </div>
            <p className="mt-1 text-xs uppercase text-zinc-500">{p.key === "free" ? "per month" : period}</p>
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
              <Button onClick={() => pay(p.key as PaidPlanKey)} className="mt-7 w-full">
                {loading === p.key ? "Opening payment…" : "Choose " + p.name}
              </Button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
