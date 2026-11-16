'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Download, FileCode2, FolderDown, Play, Save, TerminalSquare, Upload } from 'lucide-react';
import CloudBuildPanel from '@/components/ide/CloudBuildPanel';
import { LivePreviewFrame } from '@/components/engineering/LivePreviewFrame';

type Workspace = { id: string; project_name: string; type: string | null; status: string | null; files: Record<string, string> };
type TerminalLine = { kind: 'input' | 'output' | 'error'; text: string };
type PreviewJob = {
  id: string;
  status: 'queued' | 'running' | 'deployed' | 'failed';
  branch_name: string;
  deployment_url: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
};

function flattenFiles(files: Record<string, string>) {
  return Object.keys(files).sort((a, b) => a.localeCompare(b));
}

export default function WebIde({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [savedFiles, setSavedFiles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [terminalInput, setTerminalInput] = useState('help');
  const [terminal, setTerminal] = useState<TerminalLine[]>([{ kind: 'output', text: 'LEO workspace console · safe preview mode\nType "help" to see available commands.' }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewJob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const filePaths = useMemo(() => flattenFiles(files), [files]);
  const folderPaths = useMemo(() => [...new Set(filePaths.flatMap(filePath => {
    const parts = filePath.split('/');
    return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
  }))].sort((a, b) => a.localeCompare(b)), [filePaths]);
  const visibleFilePaths = useMemo(() => filePaths.filter(path => path.toLowerCase().includes(fileSearch.toLowerCase())), [filePaths, fileSearch]);
  const isDirty = useMemo(() => JSON.stringify(files) !== JSON.stringify(savedFiles), [files, savedFiles]);
  const isPreviewPending = preview?.status === 'queued' || preview?.status === 'running';

  function exportUrl(path?: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return `/api/workspaces/${encodeURIComponent(workspaceId)}/export${query}`;
  }

  function blockUnsavedExport(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isDirty) return;
    event.preventDefault();
    setError('Save your workspace changes before downloading the saved project files.');
  }

  function generatePaystackIntegration() {
    const generated: Record<string, string> = {
      'app/api/payments/paystack/initialize/route.ts': [
        'import { randomUUID } from "node:crypto";',
        'import { NextRequest, NextResponse } from "next/server";',
        'export const runtime = "nodejs";',
        'export async function POST(request: NextRequest) {',
        '  const secret = process.env.PAYSTACK_SECRET_KEY;',
        '  const amount = Number(process.env.PAYSTACK_AMOUNT_KOBO);',
        '  if (!secret) return NextResponse.json({ error: "Paystack is not configured." }, { status: 503 });',
        '  if (!Number.isSafeInteger(amount) || amount < 100) return NextResponse.json({ error: "Set PAYSTACK_AMOUNT_KOBO on the server." }, { status: 503 });',
        '  const body = await request.json().catch(() => null);',
        '  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";',
        '  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });',
        '  const origin = process.env.NEXT_PUBLIC_SITE_URL;',
        '  if (!origin || new URL(origin).protocol !== "https:") return NextResponse.json({ error: "Set an HTTPS NEXT_PUBLIC_SITE_URL." }, { status: 503 });',
        '  const reference = "pay_" + randomUUID().replaceAll("-", "");',
        '  const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" }, body: JSON.stringify({ email, amount, reference, callback_url: new URL("/payment/return", origin).toString() }), cache: "no-store", signal: AbortSignal.timeout(10000) });',
        '  const result = await response.json().catch(() => null);',
        '  if (!response.ok || !result?.status || typeof result?.data?.authorization_url !== "string") return NextResponse.json({ error: "Paystack could not initialize checkout." }, { status: 502 });',
        '  // Persist the pending order, owner, reference and expected amount before enabling fulfillment.',
        '  return NextResponse.json({ authorization_url: result.data.authorization_url, reference }, { headers: { "Cache-Control": "no-store" } });',
        '}'
      ].join("\\n"),
      'app/api/payments/paystack/verify/route.ts': [
        'import { NextRequest, NextResponse } from "next/server";',
        'export const runtime = "nodejs";',
        'export async function GET(request: NextRequest) {',
        '  const secret = process.env.PAYSTACK_SECRET_KEY;',
        '  const reference = request.nextUrl.searchParams.get("reference") || "";',
        '  const amount = Number(process.env.PAYSTACK_AMOUNT_KOBO);',
        '  if (!secret) return NextResponse.json({ error: "Paystack is not configured." }, { status: 503 });',
        '  if (!/^[A-Za-z0-9_-]{1,200}$/.test(reference)) return NextResponse.json({ error: "Invalid reference." }, { status: 400 });',
        '  const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), { headers: { Authorization: "Bearer " + secret }, cache: "no-store", signal: AbortSignal.timeout(10000) });',
        '  const result = await response.json().catch(() => null); const tx = result?.data;',
        '  if (!response.ok || !result?.status || tx?.status !== "success" || tx?.reference !== reference || tx?.amount !== amount || String(tx?.currency || "").toUpperCase() !== (process.env.PAYSTACK_CURRENCY || "NGN").toUpperCase()) return NextResponse.json({ verified: false }, { status: 409 });',
        '  // Match this reference to a pending database order and atomically fulfill it exactly once.',
        '  return NextResponse.json({ verified: true, reference, amount: tx.amount, currency: tx.currency }, { headers: { "Cache-Control": "no-store" } });
        '}'
      ].join("\\n"),
      'app/api/payments/paystack/webhook/route.ts': [
        'import { createHmac, timingSafeEqual } from "node:crypto";',
        'import { NextRequest, NextResponse } from "next/server";',
        'export const runtime = "nodejs";',
        'export async function POST(request: NextRequest) {',
        '  const secret = process.env.PAYSTACK_SECRET_KEY; if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });',
        '  const raw = await request.text(); if (raw.length > 1000000) return NextResponse.json({ error: "Payload too large." }, { status: 413 });',
        '  const signature = request.headers.get("x-paystack-signature") || "";',
        '  if (!/^[a-f0-9]{128}$/i.test(signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });',
        '  const expected = createHmac("sha512", secret).update(raw).digest(); const supplied = Buffer.from(signature, "hex");',
        '  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });',
        '  const event = JSON.parse(raw);',
        '  if (event?.event === "charge.success" && typeof event?.data?.reference === "string") { /* Verify with Paystack, reconcile to a pending order, then apply fulfillment idempotently. */ }',
        '  return NextResponse.json({ received: true });',
        '}'
      ].join("\\n"),
      'components/PaystackCheckout.tsx': [
        '"use client";',
        'import { useState } from "react";',
        'export function PaystackCheckout() {',
        '  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");',
        '  async function checkout() { setBusy(true); setError(""); try { const response = await fetch("/api/payments/paystack/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const result = await response.json(); if (!response.ok || typeof result.authorization_url !== "string") throw new Error(result.error || "Checkout failed."); window.location.assign(result.authorization_url); } catch (cause) { setError(cause instanceof Error ? cause.message : "Checkout failed."); setBusy(false); } }',
        '  return <section className="grid max-w-md gap-3 rounded-xl border p-5"><label className="grid gap-1 text-sm">Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="rounded border px-3 py-2" /></label><button type="button" disabled={busy || !email.trim()} onClick={() => void checkout()} className="rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Opening checkout…" : "Pay with Paystack"}</button>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</section>;',
        '}'
      ].join("\\n"),
      '.env.example': [
        '# Server-only secret; never use a NEXT_PUBLIC_ prefix.',
        'PAYSTACK_SECRET_KEY=sk_test_replace_me',
        'PAYSTACK_AMOUNT_KOBO=500000',
        'PAYSTACK_CURRENCY=NGN',
        'NEXT_PUBLIC_SITE_URL=https://your-domain.example'
      ].join("\\n"),
      'PAYSTACK-INTEGRATION-README.md': [
        '# Paystack integration starter',
        'Configure PAYSTACK_SECRET_KEY, PAYSTACK_AMOUNT_KOBO, PAYSTACK_CURRENCY and NEXT_PUBLIC_SITE_URL in server environment variables.',
        'Register /api/payments/paystack/webhook in the Paystack dashboard.',
        'Before production, persist pending orders and bind each unique reference to the authenticated user and expected amount. Verify reference, amount, currency and owner server-side. Fulfill only through an atomic, idempotent database transition after provider verification. A browser redirect or webhook signature alone is not proof of payment.'
      ].join("\\n")
    };
    setFiles(previous => ({ ...previous, ...generated }));
    setSavedFiles(previous => { const next = { ...previous }; for (const path of Object.keys(generated)) delete next[path]; return next; });
    setSelected('PAYSTACK-INTEGRATION-README.md');
    setTerminal(lines => [...lines, { kind: 'output', text: 'Generated Paystack starter files. Review the README, configure server-only secrets, then save the workspace.' }]);
    setError('');
  }
  async function importWorkspaceArchive(file: File) {
    setImporting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/source`, { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Project archive could not be imported.');
      await loadWorkspace();
      setTerminal(lines => [...lines, { kind: 'output', text: `Imported ${result.data?.file_count ?? 'project'} files from ${file.name}.` }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project archive could not be imported.');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  const refreshPreview = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/preview`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Preview status could not be loaded.');
    setPreview(result.preview || null);
  }, [workspaceId]);

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Workspace could not be loaded.');
      const record = result.data as Workspace;
      const loadedFiles = record.files || {};
      setWorkspace(record);
      setFiles(loadedFiles);
      setSavedFiles(loadedFiles);
      setSelected(previous => previous && previous in loadedFiles ? previous : Object.keys(loadedFiles).sort()[0] || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Workspace could not be loaded.');
        if (!active) return;
        const record = result.data as Workspace;
        const loadedFiles = record.files || {};
        setWorkspace(record);
        setFiles(loadedFiles);
        setSavedFiles(loadedFiles);
        setSelected(previous => previous && previous in loadedFiles ? previous : Object.keys(loadedFiles).sort()[0] || '');
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Workspace could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/preview`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Preview status could not be loaded.');
        if (active) setPreview(result.preview || null);
      } catch (cause) {
        if (active) setPreviewError(cause instanceof Error ? cause.message : 'Preview status could not be loaded.');
      }
    };
    void refresh();
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!isPreviewPending) return;
    const interval = window.setInterval(() => {
      void refreshPreview().catch(cause => setPreviewError(cause instanceof Error ? cause.message : 'Preview status could not be loaded.'));
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isPreviewPending, refreshPreview]);

  const saveFiles = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Files could not be saved.');
      setSavedFiles(files);
      setTerminal(lines => [...lines, { kind: 'output', text: 'Workspace files saved.' }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Files could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [files, workspaceId]);

  async function createCloudflarePreview() {
    if (isDirty) {
      setPreviewError('Save workspace files before creating a preview.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Cloudflare preview could not be queued.');
      setPreview(result.preview);
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Cloudflare preview could not be queued.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function createFile() {
    const path = window.prompt('New file path (relative to the workspace)');
    if (!path?.trim()) return;
    if (path.startsWith('/') || path.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) {
      setError('Enter a safe relative file path without traversal segments.');
      return;
    }
    setFiles(previous => ({ ...previous, [path.replaceAll('\\', '/').replace(/^\.\//, '')]: '' }));
    setSelected(path.replaceAll('\\', '/').replace(/^\.\//, ''));
    setError('');
  }

  function formatSelectedFile() {
    if (!selected) return;
    const content = files[selected] || '';
    if (!/\.json$/i.test(selected)) {
      setTerminal(lines => [...lines, { kind: 'error', text: 'Format JSON is available for .json files. Other languages are preserved as typed.' }]);
      return;
    }
    try {
      setFiles(previous => ({ ...previous, [selected]: JSON.stringify(JSON.parse(content), null, 2) + '\n' }));
      setError('');
    } catch {
      setError('This JSON file has a syntax error and could not be formatted.');
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveFiles();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        const query = window.prompt('Find a file by name');
        if (query !== null) setFileSearch(query);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveFiles]);

  function runPreviewCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;
    const [verb, ...args] = command.split(/\s+/);
    let output = '';
    let kind: TerminalLine['kind'] = 'output';
    if (verb === 'help') output = 'Workspace commands: help, ls, find <filename-fragment>, cat <path>, clear\nEdit and save files here. Arbitrary shell commands are disabled for workspace safety.';
    else if (verb === 'ls') output = filePaths.length ? filePaths.join('\n') : 'No project files yet.';
    else if (verb === 'find') {
      const needle = args.join(' ').toLowerCase();
      const matches = filePaths.filter(path => path.toLowerCase().includes(needle));
      output = needle ? (matches.length ? matches.join('\n') : 'No matching files.') : 'Usage: find <filename-fragment>';
      if (!needle) kind = 'error';
    }
    else if (verb === 'cat') {
      const path = args.join(' ');
      output = path in files ? files[path] : `File not found: ${path || '(missing path)'}`;
      if (!(path in files)) kind = 'error';
    } else if (verb === 'clear') { setTerminal([]); setTerminalInput(''); return; }
    else { output = 'Command not available in preview mode. The workspace console is intentionally non-executing.'; kind = 'error'; }
    setTerminal(lines => [...lines, { kind: 'input', text: `$ ${command}` }, { kind, text: output }]);
    setTerminalInput('');
  }

  if (loading) return <main className="min-h-[calc(100vh-140px)] bg-[#090a0c] p-6 text-sm text-white/60">Loading workspace…</main>;
  if (error && !workspace) return <main className="min-h-[calc(100vh-140px)] bg-[#090a0c] p-8 text-white"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p className="mt-2 text-white/60">{error}</p><button onClick={() => { setLoading(true); setError(''); void loadWorkspace(); }} className="mt-5 rounded-md border border-white/15 px-4 py-2">Try again</button></main>;

  return <main className="min-h-[calc(100vh-140px)] bg-[#090a0c] px-3 py-5 text-white sm:px-6">
    <header className="mx-auto mb-4 flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-xs text-white/45"><Link href="/dashboard" className="hover:text-white">Dashboard</Link><ChevronRight size={13}/><span>Web IDE</span></div><h1 className="mt-1 text-xl font-semibold">{workspace?.project_name || 'Workspace'}</h1></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded border border-white/10 px-2 py-1 text-xs text-white/55">{workspace?.status || 'Workspace'}</span><button type="button" onClick={generatePaystackIntegration} className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-400/10">Generate Paystack integration</button><input ref={importInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="sr-only" aria-label="Choose a ZIP archive to import" onChange={event => { const file = event.target.files?.[0]; if (file) void importWorkspaceArchive(file); }} /><button type="button" onClick={() => importInputRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-50"><Upload size={15}/>{importing ? 'Importing…' : 'Import ZIP'}</button><span className={`text-xs ${isDirty ? 'text-amber-300' : 'text-emerald-300'}`}>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span><a href={exportUrl()} onClick={blockUnsavedExport} aria-disabled={isDirty} className={`inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5 ${isDirty ? 'cursor-not-allowed opacity-45' : ''}`}><Download size={15}/>Download project ZIP</a><button onClick={() => void saveFiles()} disabled={saving || !isDirty} className="inline-flex items-center gap-2 rounded-md bg-[#d7aa70] px-3 py-2 text-sm font-medium text-black disabled:opacity-60"><Save size={15}/>{saving ? 'Saving…' : 'Save files'}</button></div>
    </header>
    <PaystackIntegrationGenerator workspaceId={workspaceId} />
    <CloudBuildPanel projectId={workspaceId} projectType={workspace?.type || null} />
    {error && <div role="alert" className="mx-auto mb-3 max-w-[1600px] rounded-md border border-red-400/30 bg-red-950/30 px-4 py-2 text-sm text-red-200">{error}</div>}
    <section aria-label="Cloudflare static preview" className="mx-auto mb-4 max-w-[1600px] rounded-xl border border-white/10 bg-[#101114] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Cloudflare static preview</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">
            Uploads saved static HTML/CSS/JavaScript/JSON/SVG text assets to an isolated Cloudflare Pages preview branch. This does not build framework projects or deploy to Vercel production.
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-amber-200/75">
            Preview URLs are public. Do not include secrets or private data; common credential patterns are blocked but scanning is not exhaustive.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void createCloudflarePreview()}
          disabled={isDirty || saving || previewLoading || isPreviewPending}
          className="rounded-md border border-[#d7aa70]/40 bg-[#d7aa70]/10 px-3 py-2 text-sm text-[#f1c894] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewLoading ? 'Queueing preview…' : isPreviewPending ? 'Preview in progress…' : 'Create Cloudflare preview'}
        </button>
      </div>
      {isDirty && <p className="mt-2 text-xs text-amber-200/80">Save files before creating a preview.</p>}
      {previewError && <p role="alert" className="mt-2 text-xs text-red-300">{previewError}</p>}
      {preview && <p className="mt-2 text-xs text-white/55" aria-live="polite">
        Latest preview: {preview.status}{preview.error_code ? ` (${preview.error_code})` : ''} · {new Date(preview.created_at).toLocaleString()}
      </p>}
      {preview?.status === 'deployed' && preview.deployment_url && (
        <div className="mt-4">
          <LivePreviewFrame url={preview.deployment_url} title={`${workspace?.project_name || 'Workspace'} static preview`} sandboxed />
        </div>
      )}
    </section>
    <section aria-label="Workspace editor" className="mx-auto grid min-h-[68vh] max-w-[1600px] overflow-hidden rounded-xl border border-white/10 bg-[#101114] lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
      <div className="flex min-h-[58vh] flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4 text-xs text-white/55"><FileCode2 size={15}/> Files <input aria-label="Search files" value={fileSearch} onChange={event => setFileSearch(event.target.value)} placeholder="Search files…" className="ml-auto min-w-0 w-32 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white outline-none focus:border-[#d7aa70]/60"/><button onClick={createFile} className="ml-auto rounded px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">New file</button><span>{filePaths.length} items</span></div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(150px,0.28fr)_minmax(0,1fr)]">
          <nav aria-label="Project files" className="overflow-auto border-r border-white/10 p-2">{folderPaths.length > 0 && <div className="mb-3 border-b border-white/10 pb-2"><p className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/35">Folders</p>{folderPaths.map(path => <a key={path} href={exportUrl(path)} onClick={blockUnsavedExport} title={`Download ${path} as a ZIP`} className={`flex items-center gap-2 rounded px-2 py-2 text-xs text-white/55 hover:bg-white/5 hover:text-white ${isDirty ? 'cursor-not-allowed opacity-45' : ''}`}><FolderDown size={14}/><span className="min-w-0 flex-1 truncate">{path}</span></a>)}</div>}{visibleFilePaths.length ? visibleFilePaths.map(path => <div key={path} className={`flex items-center gap-1 rounded px-1 ${selected === path ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><button onClick={() => setSelected(path)} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2 text-left text-xs"><FileCode2 size={14}/><span className="truncate">{path}</span></button><a aria-label={`Download ${path}`} title="Download file" href={exportUrl(path)} onClick={blockUnsavedExport} className={`rounded p-1.5 hover:bg-white/10 ${isDirty ? 'cursor-not-allowed opacity-45' : ''}`}><Download size={13}/></a></div>) : <p className="px-2 py-3 text-xs leading-5 text-white/45">No matching files. Use New file to add one.</p>}</nav>
          <div className="flex min-h-[50vh] min-w-0 flex-col"><div className="flex h-10 items-center gap-2 border-b border-white/10 px-4 font-mono text-xs text-white/55"><span className="truncate">{selected || 'No file selected'}</span>{selected && /\.json$/i.test(selected) && <button onClick={formatSelectedFile} className="ml-auto rounded px-2 py-1 hover:bg-white/10">Format JSON</button>}</div>{selected ? <textarea aria-label={`Edit ${selected}`} spellCheck={false} value={files[selected] || ''} onChange={event => setFiles(previous => ({ ...previous, [selected]: event.target.value }))} className="min-h-[48vh] flex-1 resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-[#e6e7e9] outline-none focus:ring-1 focus:ring-inset focus:ring-[#d7aa70]/40" /> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-white/40">Choose a project file to start editing.</div>}</div>
        </div>
      </div>
      <aside aria-label="Workspace terminal" className="flex min-h-[45vh] flex-col bg-[#0b0c0e]">
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4 text-xs text-white/60"><TerminalSquare size={15}/> Workspace tools <span className="ml-auto rounded bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide">Safe mode</span></div>
        <div className="flex-1 space-y-3 overflow-auto p-4 font-mono text-xs leading-5" aria-live="polite">{terminal.map((line, index) => <pre key={`${index}-${line.text}`} className={`whitespace-pre-wrap break-words ${line.kind === 'input' ? 'text-[#d7aa70]' : line.kind === 'error' ? 'text-red-300' : 'text-white/65'}`}>{line.text}</pre>)}</div>
        <form onSubmit={runPreviewCommand} className="flex items-center gap-2 border-t border-white/10 p-3"><span aria-hidden="true" className="font-mono text-[#d7aa70]">›</span><input aria-label="Preview command" value={terminalInput} onChange={event => setTerminalInput(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none placeholder:text-white/35" placeholder="help, ls, find <name>, cat <path>"/><button aria-label="Run preview command" className="rounded p-2 text-white/60 hover:bg-white/10 hover:text-white"><Play size={14}/></button></form>
      </aside>
    </section>
  </main>;
}
