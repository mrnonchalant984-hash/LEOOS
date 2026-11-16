"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { OnboardingWelcome } from "@/components/OnboardingWelcome";
import { DashboardHome } from "@/components/dashboard/DashboardHome";

export type DashboardData = {
  user: { name: string; email: string };
  owner: boolean;
  plan: string;
  status: string;
  credits: number | string;
  counts: { conversations: number; memories: number; projects: number; websites: number; unreadNotifications: number };
  projects: { id: string; project_name: string; type: string | null; status: string | null; progress: number | null; created_at: string }[];
  websites: { id: string; business_name: string | null; website_type: string; status: string; live_url: string | null; updated_at: string }[];
};

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { data: auth } = await supabase.auth.getSession();
        if (!auth.session) { router.replace("/auth?next=/dashboard"); return; }
        const response = await fetch("/api/dashboard", {
          headers: { Authorization: `Bearer ${auth.session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Dashboard could not be loaded.");
        if (active) setData(result as DashboardData);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Dashboard could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f5f6fa] text-[#171923] dark:bg-[#101116] dark:text-white">
      <OnboardingWelcome />
      {error ? (
        <div className="mx-auto max-w-2xl px-5 py-20"><div role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700">{error}</div></div>
      ) : data ? <DashboardHome data={data} /> : (
        <div className="mx-auto flex min-h-screen max-w-7xl gap-5 p-5">
          <div className="hidden w-60 animate-pulse rounded-3xl bg-black/5 dark:bg-white/5 lg:block" />
          <div className="flex-1 space-y-5"><div className="h-[420px] animate-pulse rounded-[2rem] bg-black/5 dark:bg-white/5"/><div className="h-64 animate-pulse rounded-3xl bg-black/5 dark:bg-white/5"/></div>
        </div>
      )}
    </main>
  );
}
