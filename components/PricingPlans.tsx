"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatNairaKobo } from "@/lib/pricing";
const plans = ["standard", "pro", "business"] as const;
const periods = ["monthly", "quarterly", "yearly"] as const;
const names = { standard: "STANDARD", pro: "PRO", business: "BUSINESS" };
const services = [
  ["ai-mockup", "AI Mockup", 5000000],
  ["code-review", "Code Review", 2000000],
] as const;
export function PricingPlans() {
  const router = useRouter();
  const [period, setPeriod] = useState<(typeof periods)[number]>("monthly");
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [user, setUser] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d) => setPrices(d.prices || {}));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(!!d.authenticated));
  }, []);
  async function buy(plan: string) {
    if (!user) {
      router.push("/auth");
      return;
    }
    setBusy(plan);
    setMsg("");
    try {
      const r = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "plan", plan, billing_period: period }),
      });
      const d = await r.json();
      if (d.authorization_url) window.location.assign(d.authorization_url);
      else setMsg(d.error || "Payment could not be started.");
    } catch {
      setMsg("Payment could not be started. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }
  async function buyService(item_key: string) {
    if (!user) {
      router.push("/auth");
      return;
    }
    setBusy(item_key);
    setMsg("");
    try {
      const r = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "service", item_key }),
      });
      const d = await r.json();
      if (d.authorization_url) window.location.assign(d.authorization_url);
      else setMsg(d.error || "Payment could not be started.");
    } catch {
      setMsg("Payment could not be started. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="mt-8 flex flex-wrap gap-2">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full border px-4 py-2 text-sm ${period === p ? "border-yellow-400 bg-yellow-400 text-black" : "border-zinc-800"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const price = prices[`${plan}_${period}`];
          return (
            <div
              key={plan}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
            >
              <h2 className="text-xl font-black">{names[plan]}</h2>
              <p className="mt-2 text-sm text-zinc-500">
                {plan === "standard"
                  ? "Core Leo tools for getting started."
                  : plan === "pro"
                    ? "More creative and development features."
                    : "All currently configured Leo features."}
              </p>
              <div className="mt-6 text-3xl font-black text-yellow-300">
                {price
                  ? formatNairaKobo(price)
                  : "Price unavailable"}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{period === "monthly" ? "per month · billed monthly" : `total billed ${period}`}</p>
              <button
                disabled={!price || !!busy}
                onClick={() => buy(plan)}
                className="mt-6 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black disabled:opacity-40"
              >
                {busy === plan
                  ? "Starting payment…"
                  : user
                    ? "Pay securely"
                    : "Log in to continue"}
              </button>
            </div>
          );
        })}
      </div>
      {msg && <p className="mt-5 text-sm text-red-300">{msg}</p>}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {services.map(([key, name, price]) => (
          <div
            key={key}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <h3 className="font-black">{name}</h3>
            <div className="mt-3 text-2xl font-black text-yellow-300">
              ₦{(price / 100).toLocaleString()}
            </div>
            <button
              disabled={!!busy}
              onClick={() => buyService(key)}
              className="mt-5 w-full rounded-xl border border-yellow-400 px-4 py-3 font-bold text-yellow-300"
            >
              {busy === key
                ? "Starting payment…"
                : user
                  ? "Pay securely"
                  : "Log in to continue"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-zinc-600">
        Prices are read from the server deployment configuration. No feature is
        unlocked until Paystack verification succeeds.
      </p>
    </>
  );
}
