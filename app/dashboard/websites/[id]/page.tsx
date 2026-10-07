"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Rocket } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { LEO_TEMPLATES } from "@/data/website-templates";

type WebsiteProject = {
  id: string;
  website_type: string;
  business_name: string | null;
  chatbot_enabled: boolean;
  payment_mode: string;
  requirements: Record<string, string>;
  status: string;
  project_type: string;
  build_status: string;
  build_step: string | null;
  build_provider: string | null;
  github_repo: string | null;
  live_url: string | null;
  admin_url: string | null;
};
type BuildRecord = {
  id: string;
  provider: string;
  status: string;
  step: string;
  logs: { at: string; status: string; step: string; message: string }[];
  error: string | null;
  deployment_id: string | null;
  deployment_url: string | null;
  created_at: string;
  completed_at: string | null;
};

export default function WebsiteManagementPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<WebsiteProject | null>(null);
  const [builds, setBuilds] = useState<BuildRecord[]>([]);
  const [deployments, setDeployments] = useState<{ id: string; event_type: string; status: string; message: string | null; metadata: Record<string, unknown>; created_at: string }[]>([]);
  const [hosting, setHosting] = useState<{ status: string; starts_at: string; ends_at: string; next_renewal_at: string | null } | null>(null);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const [hostingWarning, setHostingWarning] = useState("");
  const [missingRequirements, setMissingRequirements] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        location.assign("/auth");
        return;
      }
      const response = await fetch(
        `/api/setup/projects?project_id=${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Project could not be loaded.");
      if (alive) {
        setProject(result.project);
        setBuilds(result.builds || []);
        setDeployments(result.deployments || []);
        setHosting(result.hosting || null);
      }
    })()
      .catch((cause) => alive && setError(cause instanceof Error ? cause.message : "Project could not be loaded."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  async function deploy() {
    if (!project || deploying) return;
    setDeploying(true);
    setError("");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Please log in to deploy this website.");
      const template = LEO_TEMPLATES.find(
        (item) => item.id === project.requirements?.template_id,
      );
      const clientRequirements = Object.entries(project.requirements || {})
        .filter(([key, value]) => key !== "template_id" && key !== "template_name" && value)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      const prompt = [
        `Build a production-ready ${project.website_type.replaceAll("_", " ")} website for ${project.business_name}.`,
        template && `Use ${template.name} as the visual starting point: ${template.description} Style: ${template.style}. Pages: ${template.pages.join(", ")}.`,
        clientRequirements && `Client-provided requirements:\n${clientRequirements}`,
        brief.trim() && `Additional direction:\n${brief.trim()}`,
        "Use only supplied facts and assets. Clearly mark missing real content; do not invent testimonials, credentials, or business details.",
      ].filter(Boolean).join("\n\n");
      const response = await fetch("/api/build-deploy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          project_id: project.id,
          client_name: project.business_name,
          chatbot_enabled: project.chatbot_enabled,
          payment_mode: project.payment_mode,
          website_tier: "LEO OS project",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Deployment failed.");
      const refresh = await fetch(`/api/setup/projects?project_id=${encodeURIComponent(project.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const refreshed = await refresh.json();
      if (!refresh.ok) throw new Error(refreshed.error || "Deployment completed but project status could not be refreshed.");
      setProject(refreshed.project);
      setBuilds(refreshed.builds || []);
      setDeployments(refreshed.deployments || []);
      setHosting(refreshed.hosting || null);
      setMissingRequirements(result.missingRequirements || []);
      setHostingWarning(result.hostingTrialError || result.warning || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deployment failed.");
    } finally {
      setDeploying(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-12"><p className="text-zinc-400">Loading website project…</p></main>;
  if (error && !project) return <main className="mx-auto max-w-5xl px-4 py-12"><p role="alert" className="text-red-300">{error}</p></main>;
  if (!project) return null;

  const template = LEO_TEMPLATES.find((item) => item.id === project.requirements?.template_id);
  const requirements = Object.entries(project.requirements || {}).filter(([key, value]) => key !== "template_id" && key !== "template_name" && value);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Dashboard</Link>
      <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--gold)]">{project.project_type.replaceAll("_", " ")} · {project.build_status || project.status}</p>
          <h1 className="mt-2 text-3xl font-black">{project.business_name}</h1>
          {template && <p className="mt-2 text-sm text-zinc-400">Template: {template.name} · {template.pages.join(" · ")}</p>}
        </div>
        {project.live_url && <a href={project.live_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-[var(--gold)]"><ExternalLink size={16} /> Open live site</a>}
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-zinc-500">Build status</p><p className="mt-2 font-semibold">{project.build_status || "draft"}</p><p className="mt-1 text-xs text-zinc-500">{project.build_step || "Not building"}</p></div>
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-zinc-500">Build provider</p><p className="mt-2 font-semibold">{project.build_provider || "Not started"}</p></div>
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-zinc-500">Hosting</p><p className="mt-2 font-semibold">{hosting?.status || (project.live_url ? "Trial pending" : "Starts after first deployment")}</p>{hosting && <p className="mt-1 text-xs text-zinc-500">Until {new Date(hosting.ends_at).toLocaleDateString()}</p>}</div>
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-zinc-500">Source repository</p>{project.github_repo ? <a href={project.github_repo} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--gold)]">Open GitHub <ExternalLink size={14}/></a> : <p className="mt-2 text-sm text-zinc-500">Not created yet</p>}</div>
      </section>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <h2 className="text-lg font-bold">Project brief</h2>
        {requirements.length ? <dl className="mt-4 grid gap-3 sm:grid-cols-2">{requirements.map(([question, answer]) => <div key={question} className="border-t border-white/10 pt-3"><dt className="text-xs text-zinc-500">{question}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{answer}</dd></div>)}</dl> : <p className="mt-3 text-sm text-zinc-500">No additional requirements were provided.</p>}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <label htmlFor="build-brief" className="text-lg font-bold">Preview and deploy</label>
        <p className="mt-2 text-sm text-zinc-400">The saved template and requirements will guide generation. Real assets and business details are never fabricated.</p>
        <textarea id="build-brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Optional additional direction for the first build" className="mt-4 min-h-28 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-[var(--gold)]" />
        <button onClick={deploy} disabled={deploying} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-5 py-3 font-bold text-black disabled:opacity-50">
          {deploying ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />}
          {deploying ? "Building and deploying…" : project.live_url ? "Build and deploy update" : "Build and deploy website"}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
        {hostingWarning && <p role="alert" className="mt-4 text-sm text-amber-200">The site is live, but hosting trial setup needs attention: {hostingWarning}</p>}
        {project.live_url && <p className="mt-4 text-sm text-emerald-300">Deployment is ready. <a className="underline" href={project.live_url} target="_blank" rel="noreferrer">Preview the live site</a></p>}
        {missingRequirements.length > 0 && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><p className="text-sm font-semibold text-amber-200">Real content still needed</p><ul className="mt-2 list-inside list-disc text-sm text-zinc-300">{missingRequirements.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <h2 className="text-lg font-bold">Build history</h2>
          {builds.length ? <div className="mt-4 space-y-3">{builds.map((build) => <article key={build.id} className="border-t border-white/10 pt-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{build.status}</p><time className="text-xs text-zinc-500">{new Date(build.created_at).toLocaleString()}</time></div><p className="mt-1 text-sm text-zinc-400">{build.step} · {build.provider}</p>{build.error && <pre className="mt-2 whitespace-pre-wrap text-xs text-red-300">{build.error}</pre>}{build.logs?.length > 0 && <ul className="mt-2 space-y-1 text-xs text-zinc-500">{build.logs.slice(-5).reverse().map((entry, index) => <li key={`${entry.at}-${index}`}>{new Date(entry.at).toLocaleTimeString()} · {entry.message}</li>)}</ul>}</article>)}</div> : <p className="mt-3 text-sm text-zinc-500">No builds yet.</p>}
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <h2 className="text-lg font-bold">Deployment history</h2>
          {deployments.length ? <div className="mt-4 space-y-3">{deployments.map((deployment) => <article key={deployment.id} className="border-t border-white/10 pt-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{deployment.event_type} · {deployment.status}</p><time className="text-xs text-zinc-500">{new Date(deployment.created_at).toLocaleString()}</time></div><p className="mt-1 text-sm text-zinc-400">{deployment.message || "No additional details"}</p>{typeof deployment.metadata?.vercel === "string" && <a className="mt-1 inline-block text-sm text-[var(--gold)]" href={deployment.metadata.vercel.startsWith("http") ? deployment.metadata.vercel : `https://${deployment.metadata.vercel}`} target="_blank" rel="noreferrer">Open deployment</a>}</article>)}</div> : <p className="mt-3 text-sm text-zinc-500">No deployments yet.</p>}
        </section>
      </div>
    </main>
  );
}