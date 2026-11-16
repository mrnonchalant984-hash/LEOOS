"use client";

import { useState } from "react";
import { Github, LoaderCircle, Upload } from "lucide-react";

type Props = { workspaceId: string; disabled?: boolean };

export function GitHubRepositoryImporter({ workspaceId, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [repository, setRepository] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function loadBranches() {
    setLoadingBranches(true); setError(""); setStatus(""); setBranches([]);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/github-import?repository=${encodeURIComponent(repository.trim())}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Repository branches could not be loaded.");
      const available = Array.isArray(result.branches) ? result.branches.filter((value: unknown): value is string => typeof value === "string") : [];
      if (!available.length) throw new Error("No branches were returned for this repository.");
      setBranches(available);
      setSelectedBranch(result.default_branch || available[0]);
      setStatus(`Loaded ${available.length} branches from ${result.repository || "GitHub"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Repository branches could not be loaded."); }
    finally { setLoadingBranches(false); }
  }

  async function importBranch() {
    if (!selectedBranch || disabled) return;
    setImporting(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/github-import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: repository.trim(), branch: selectedBranch }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Repository branch could not be imported.");
      setStatus(`Imported ${result.repository || repository} · ${result.branch || selectedBranch}. Refreshing workspace…`);
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Repository branch could not be imported."); }
    finally { setImporting(false); }
  }

  return <div className="relative">
    <button type="button" disabled={disabled} onClick={() => { setOpen(value => !value); setError(""); }} className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"><Github size={15}/> Import GitHub</button>
    {open && <section aria-label="Import GitHub repository" className="absolute right-0 top-12 z-40 w-[min(92vw,440px)] rounded-xl border border-white/15 bg-[#17191d] p-4 shadow-2xl">
      <h2 className="font-semibold text-white">Import a GitHub repository</h2>
      <p className="mt-1 text-xs leading-5 text-white/55">Choose the repository and branch to import into this project’s private source workspace. Private repositories require a server-configured GitHub token.</p>
      <label className="mt-4 block text-xs text-white/65">Repository URL or owner/repository<input value={repository} onChange={event => { setRepository(event.target.value); setBranches([]); setStatus(""); }} placeholder="https://github.com/owner/repository" className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-[#d7aa70]/60"/></label>
      <button type="button" onClick={() => void loadBranches()} disabled={loadingBranches || !repository.trim()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-white disabled:opacity-40">{loadingBranches && <LoaderCircle size={14} className="animate-spin"/>}Load branches</button>
      {branches.length > 0 && <label className="mt-3 block text-xs text-white/65">Branch<select value={selectedBranch} onChange={event => setSelectedBranch(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#101114] px-3 py-2.5 text-sm text-white">{branches.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      {disabled && <p className="mt-3 text-xs text-amber-200">Save or discard your editor changes before importing a repository.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      {status && <p role="status" className="mt-3 text-xs text-emerald-200">{status}</p>}
      <button type="button" onClick={() => void importBranch()} disabled={disabled || importing || !selectedBranch} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#d7aa70] px-4 py-3 text-sm font-semibold text-black disabled:opacity-40">{importing ? <LoaderCircle size={15} className="animate-spin"/> : <Upload size={15}/>}Import selected branch</button>
    </section>}
  </div>;
}
