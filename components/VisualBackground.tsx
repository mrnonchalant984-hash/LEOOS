"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { resolveVisualIdentity } from "@/components/visual-identity";

const applicationPrefixes = [
  "/dashboard", "/app", "/projects", "/agents", "/deployments", "/analytics",
  "/api-keys", "/audit", "/auth", "/account", "/admin", "/developers", "/docs",
  "/integrations", "/leo-ai", "/notifications", "/observability", "/organizations",
  "/resources", "/setup", "/support", "/status", "/team", "/templates", "/tutorials",
  "/webhooks", "/whats-new",
];

function BackgroundFallback() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(139,92,246,.08),transparent_32%),radial-gradient(circle_at_15%_20%,rgba(56,189,248,.035),transparent_25%),radial-gradient(circle_at_85%_75%,rgba(139,92,246,.03),transparent_25%)]" />
      <div className="absolute inset-0 bg-black/65" />
    </div>
  );
}

const Background3D = dynamic(() => import("@/components/Background3D"), {
  ssr: false,
  loading: BackgroundFallback,
});

export default function VisualBackground() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const inWorkspace = applicationPrefixes.some(
    (prefix) => pathname === prefix || pathname?.startsWith(prefix + "/"),
  );

  useEffect(() => {
    if (pathname === "/" || inWorkspace) return;
    const timer = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(timer);
  }, [inWorkspace, pathname]);

  if (pathname === "/") return null;
  if (inWorkspace) {
    return (
      <div
        aria-hidden
        className="workspace-atmosphere"
        data-visual-identity={resolveVisualIdentity(pathname)}
      />
    );
  }

  return ready ? <Background3D /> : <BackgroundFallback />;
}
