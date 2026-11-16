"use client";

import { useState } from "react";
import { CreditCard, Plus, X } from "lucide-react";
import { generatePaystackIntegrationFiles } from "@/lib/paystack-integration-generator";

export function PaystackIntegrationGenerator({ onGenerate, existingFiles }: { onGenerate: (files: Record<string, string>) => void; existingFiles: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  return <div className="relative">
    <button type="button" onClick={() => { setOpen(value => !value); setAdded(false); }} className="inline-flex items-center gap-2 rounded-md border border-emerald-300/30 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-300/10"><CreditCard size={15}/> Paystack generator</button>
    {open && <section aria-label="Paystack integration generator" className="absolute right-0 top-12 z-30 w-[min(92vw,440px)] rounded-xl border border-white/15 bg-[#17191d] p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-white">Generate Paystack integration</h2><button type="button" aria-label="Close generator" onClick={() => setOpen(false)} className="rounded p-1 text-white/60 hover:bg-white/10"><X size={17}/></button></div>
      <p className="mt-2 text-sm leading-6 text-white/65">Add Next.js TypeScript checkout initialization, server-side transaction verification, webhook signature validation and setup documentation to the current project.</p>
      <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/80">Generated starter contains explicit order/database TODOs. Replace the illustrative amount with a server-calculated order price, persist pending references, and implement atomic idempotent fulfillment before live use.</div>
      {added ? <p role="status" className="mt-3 text-sm text-emerald-200">Files added to the editor. Review and save them before use.</p> : <button type="button" onClick={() => { onGenerate(generatePaystackIntegrationFiles(Object.keys(existingFiles).some(path => path.startsWith('src/app/') || path.startsWith('src/pages/')))); setAdded(true); }} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950"><Plus size={16}/> Add integration files</button>}
      <p className="mt-3 text-[11px] text-white/40">No credentials are generated, no existing files are overwritten, and nothing is deployed.</p>
    </section>}
  </div>;
}
