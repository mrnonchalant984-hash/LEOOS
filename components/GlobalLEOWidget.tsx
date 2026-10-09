"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";

const LazyLEOWidget = dynamic(
  () => import("./LEOWidget").then((module) => module.LEOWidget),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed bottom-5 right-5 z-40 rounded-full bg-[var(--gold)] px-4 py-3 text-sm font-semibold text-black shadow-2xl"
        role="status"
        aria-live="polite"
      >
        Opening Leo…
      </div>
    ),
  },
);

const workspacePrefixes = [
  "/app", "/auth", "/admin", "/dashboard", "/projects", "/agents", "/deployments",
  "/analytics", "/api-keys", "/audit", "/account", "/developers", "/docs",
  "/integrations", "/leo-ai", "/notifications", "/observability", "/organizations",
  "/resources", "/setup", "/support", "/status", "/team", "/templates", "/tutorials",
  "/webhooks", "/whats-new",
];

function LEOWidgetLauncher() {
  const [started, setStarted] = useState(false);

  if (started) return <LazyLEOWidget full />;

  return (
    <button
      type="button"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--gold)] text-black shadow-2xl"
      aria-label="Open Leo AI chat"
      aria-haspopup="dialog"
      aria-expanded={false}
      onClick={() => setStarted(true)}
    >
      <Bot aria-hidden="true" />
    </button>
  );
}

export function GlobalLEOWidget() {
  const pathname = usePathname();
  if (workspacePrefixes.some((prefix) => pathname === prefix || pathname?.startsWith(prefix + "/"))) {
    return null;
  }
  return <LEOWidgetLauncher key={pathname} />;
}
