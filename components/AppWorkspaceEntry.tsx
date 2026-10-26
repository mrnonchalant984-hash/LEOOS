"use client";

import { useSearchParams } from "next/navigation";
import { LEOWidget } from "@/components/LEOWidget";

export function AppWorkspaceEntry() {
  const params = useSearchParams();
  return <LEOWidget full initialSessionId={params.get("session_id") || ""} />;
}
