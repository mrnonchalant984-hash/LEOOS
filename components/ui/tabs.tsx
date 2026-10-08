"use client";
import { cn } from "@/lib/utils";
export function Tabs({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) { return <div data-value={value}>{children}</div>; }
export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) { return <div className={cn("inline-flex rounded-full border border-white/10 bg-white/[.03] p-1 shadow-inner", className)}>{children}</div>; }
export function TabsTrigger({ value, active, onClick, children }: { value: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn("rounded-full px-4 py-2 text-sm font-medium transition", active ? "bg-[var(--gold)] text-black shadow-[0_8px_24px_rgba(212,175,55,.18)]" : "text-white/55 hover:bg-white/[.04] hover:text-white")}>{children}</button>; }
