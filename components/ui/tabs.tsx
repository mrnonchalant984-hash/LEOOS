"use client";
import { cn } from "@/lib/utils";
export function Tabs({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) { return <div data-value={value}>{children}</div>; }
export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) { return <div className={cn("inline-flex rounded-full border border-black/10 bg-black/[.03] p-1", className)}>{children}</div>; }
export function TabsTrigger({ value, active, onClick, children }: { value: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn("rounded-full px-4 py-2 text-sm font-medium transition", active ? "bg-black text-white" : "text-black/60 hover:text-black")}>{children}</button>; }
