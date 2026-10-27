"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/GlassCard";
import { WEBSITE_TYPES, TYPE_QUESTIONS, DB_NEEDED } from "@/lib/website-types";
import { LEO_TEMPLATES } from "@/data/website-templates";
import { createBrowserClient } from "@supabase/ssr";
import type { ProjectType } from "@/lib/pricing";
const DEFAULT_QUESTIONS = [
  "What is the business/project name?",
  "Who is the audience?",
  "What content/assets must be supplied?",
  "Are payment, booking or accounts required?",
  "What contact links should be used?",
  "What visual style, colors, typography and references should the design follow?",
  "What are the must-have pages/screens and their purpose?",
];
const PROJECT_TYPE_QUESTIONS: Partial<Record<ProjectType, string[]>> = {
  website: ["What visual style, colors, typography and reference websites should guide the design?", "List the required pages, navigation and key sections.", "What should the primary call-to-action do?"],
  web_app: ["Describe the main user workflows and dashboard screens.", "Which user roles and permissions are needed?", "What data entities, integrations and APIs are required?", "Describe the visual design system: colors, typography, density and reference products."],
  saas: ["What problem does the SaaS solve and for which users?", "What plans, feature gates and usage/credit limits should exist?", "Which roles, organization/team features and billing flows are required?", "What data model, integrations and admin tools are required?", "Describe the brand, design system and reference products."],
  mobile_app: ["What are the core user journeys and required screens?", "Which navigation pattern should be used (tabs, stack, drawer, or custom)?", "What visual style, colors, typography, spacing and reference apps should guide the UI?", "What authentication, offline behavior, device permissions and integrations are needed?", "What backend/data model and APIs should the app use?", "What platform targets are required: Android, iOS, or both?", "If you already have them, provide the Android package name and iOS bundle identifier. Otherwise write ‘generate draft identifiers’ so LeonardX can add project-specific draft IDs that you must verify before publishing."],
  game: ["Describe the core gameplay loop, win/lose conditions and controls.", "Is the game 2D or 3D, and what art direction/camera should it use?", "List the levels, modes, characters and progression systems.", "Which platforms and input methods must be supported?", "Does it need multiplayer, save data, accounts or monetization?"],
};
const icons = [
  "🏢",
  "💼",
  "✨",
  "🍽️",
  "🏠",
  "🛒",
  "📦",
  "📅",
  "👥",
  "☁️",
  "✍️",
  "📰",
  "💬",
  "🎟️",
  "🎓",
  "📚",
  "❤️",
  "🏛️",
  "🚀",
  "📄",
];
export default function Setup() {
  const router = useRouter();
  const [loc, setLoc] = useState<any>();
  const [type, setType] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("website");
  const [allowedProjectTypes, setAllowedProjectTypes] = useState<ProjectType[]>(["website"]);
  const [planProjectTypes, setPlanProjectTypes] = useState<ProjectType[]>(["website"]);
  const [providers, setProviders] = useState<Record<string, { status: string; message?: string }>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<(typeof LEO_TEMPLATES)[number] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [chatbot, setChatbot] = useState<boolean | null>(null);
  const [payment, setPayment] = useState<
    "automatic_paystack" | "manual_email" | null
  >(null);
  const [business, setBusiness] = useState("");
  const [saving, setSaving] = useState(false);
  const [buildPolicy, setBuildPolicy] = useState<"ask" | "once" | "always">("once");
  const chooseType = (value: string) => {
    setType(value);
    setAnswers([...((TYPE_QUESTIONS[value] || DEFAULT_QUESTIONS)), ...(PROJECT_TYPE_QUESTIONS[projectType] || [])].map(() => ""));
  };
  useEffect(() => {
    let frame = 0;
    try {
      const savedPolicy = window.localStorage.getItem("leonardx_build_policy");
      if (savedPolicy === "always") {
        frame = window.requestAnimationFrame(() => setBuildPolicy("always"));
      }
    } catch {}
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/auth?next=${encodeURIComponent(next)}`);
        return;
      }
      const response = await fetch("/api/setup/projects", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      if (response.ok) {
        const result = await response.json();
        if (active) {
          setAllowedProjectTypes(result.capabilities?.projectTypes || ["website"]);
          setPlanProjectTypes(result.capabilities?.planProjectTypes || ["website"]);
          setProviders(result.capabilities?.providers || {});
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedProjectType = params.get("project_type");
      if (["website", "web_app", "saas", "mobile_app", "game"].includes(requestedProjectType || "")) {
        const selectedProjectType = requestedProjectType as ProjectType;
        setProjectType(selectedProjectType);
        if (selectedProjectType === "mobile_app" || selectedProjectType === "game") {
          setType(selectedProjectType);
          setAnswers((PROJECT_TYPE_QUESTIONS[selectedProjectType] || DEFAULT_QUESTIONS).map(() => ""));
        }
      }
      const templateId = params.get("template");
      const template = LEO_TEMPLATES.find((item) => item.id === templateId);
      if (!template) return;
      setSelectedTemplate(template);
      setType(template.type);
      setAnswers((TYPE_QUESTIONS[template.type] || DEFAULT_QUESTIONS).map(() => ""));
      if (template.type === "saas") setProjectType("saas");
      setBusiness(template.name);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    fetch("/api/setup/context")
      .then((r) => r.json())
      .then(setLoc);
  }, []);
  const questions = type === "mobile_app" || type === "game"
    ? PROJECT_TYPE_QUESTIONS[projectType] || DEFAULT_QUESTIONS
    : [...(TYPE_QUESTIONS[type] || TYPE_QUESTIONS.company), ...(PROJECT_TYPE_QUESTIONS[projectType] || [])];
  const projectTypeLabel: Record<ProjectType, string> = {
    website: "website",
    web_app: "web app",
    saas: "SaaS",
    mobile_app: "mobile app",
    game: "game",
  };
  const projectTypeAvailable = allowedProjectTypes.includes(projectType);
  const isCloudProject = projectType === "mobile_app" || projectType === "game";
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <GlassCard className="p-6">
        <p className="text-sm text-orange-300">
          Auto-detected: {loc?.countryName || "detecting…"} •{" "}
          {loc?.timezone || "…"} • {loc?.currency || "…"} {loc?.symbol || ""}
        </p>
        <h1 className="mt-3 text-4xl font-black">Let’s build your {projectTypeLabel[projectType]}</h1>
        <p className="mt-2 text-zinc-400">
          Leo uses your location automatically. It will never ask you to type
          your country just to set currency/timezone.
        </p>
      </GlassCard>
      <section className="mt-6">
        <p className="mb-3 text-sm font-semibold">Project type</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {([
            ["website", "Website"],
            ["web_app", "Web app"],
            ["saas", "SaaS"],
            ["mobile_app", "Mobile app"],
            ["game", "Game"],
          ] as const).map(([value, label]) => {
            const provider = providers[value];
            const available = allowedProjectTypes.includes(value);
            const inPlan = planProjectTypes.includes(value);
            const cloudProject = value === "mobile_app" || value === "game";
            const reason = !inPlan
              ? "Not included in this plan"
              : provider?.status === "not_integrated" || provider?.status === "not_configured"
                ? provider.message
                : undefined;
            return (
              <button
                key={value}
                type="button"
                disabled={!available}
                onClick={() => {
                  setProjectType(value);
                  if (value === "mobile_app" || value === "game") {
                    setType(value);
                    setAnswers((PROJECT_TYPE_QUESTIONS[value] || DEFAULT_QUESTIONS).map(() => ""));
                  } else if (type === "mobile_app" || type === "game") {
                    setType("");
                    setAnswers([]);
                  } else if (type) {
                    setAnswers([...((TYPE_QUESTIONS[type] || TYPE_QUESTIONS.company)), ...(PROJECT_TYPE_QUESTIONS[value] || [])].map(() => ""));
                  }
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${projectType === value ? "border-orange-400 bg-orange-500/10" : "border-white/10 bg-white/[.03]"} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span>{label}</span>
                {((!available && reason) || (available && cloudProject && reason)) && <span className="mt-1 block text-xs font-normal text-zinc-500">{available ? `Drafts are available; ${reason}` : reason}</span>}
              </button>
            );
          })}
        </div>
        {!allowedProjectTypes.includes(projectType) && <a href="/pricing" className="mt-2 inline-block text-sm text-[var(--gold)]">View plans</a>}
      </section>
      {!projectTypeAvailable ? (
        <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
          <h2 className="font-semibold">This builder is unavailable</h2>
          <p className="mt-2 text-sm text-zinc-400">{providers[projectType]?.message || "This project type is not available on the current plan."}</p>
          {!planProjectTypes.includes(projectType) && <a href="/pricing" className="mt-3 inline-block text-sm font-semibold text-[var(--gold)]">View plans</a>}
        </section>
      ) : !type && projectType !== "mobile_app" && projectType !== "game" ? (
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          {WEBSITE_TYPES.map(([id, label], i) => (
            <button
              key={id}
                onClick={() => chooseType(id)}
              className="rounded-2xl border border-white/10 bg-white/[.04] p-5 text-left transition hover:-translate-y-1 hover:border-orange-400"
            >
              <div className="text-3xl">{icons[i]}</div>
              <b className="mt-3 block">{label}</b>
            </button>
          ))}
        </section>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
          <GlassCard className="p-6">
            <div className="flex justify-between">
              <h2 className="text-2xl font-bold">
                Questions for {type.replaceAll("_", " ")}
              </h2>
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  chooseType("");
                }}
                className="text-sm text-orange-300"
              >
                Change type
              </button>
            </div>
            {selectedTemplate && (
              <p className="mt-2 text-sm text-orange-300">
                Starting from {selectedTemplate.name}
              </p>
            )}
            <input
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Business / project name"
              className="mt-5 w-full rounded-xl border border-white/10 bg-black/40 p-3"
            />
            {questions.map((q, i) => (
              <div key={q} className="mt-4">
                <label className="text-sm text-zinc-300">{q}</label>
                <textarea
                  value={answers[i] || ""}
                  onChange={(e) =>
                    setAnswers((a) =>
                      a.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                  className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3"
                />
              </div>
            ))}
            {!isCloudProject && <div className="mt-6 rounded-2xl border border-white/10 p-4">
              <b>AI Chatbot Assistant?</b>
              <p className="mt-1 text-sm text-zinc-400">
                Customers can ask questions 24/7. If enabled, the client
                supplies their own OpenAI API key.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setChatbot(true)}
                  className={`rounded-full px-4 py-2 ${chatbot === true ? "bg-orange-500" : "bg-white/10"}`}
                >
                  Yes, add chatbot
                </button>
                <button
                  onClick={() => setChatbot(false)}
                  className={`rounded-full px-4 py-2 ${chatbot === false ? "bg-orange-500" : "bg-white/10"}`}
                >
                  No, just website
                </button>
              </div>
            </div>}
            {(type === "ecommerce" || DB_NEEDED.has(type)) && (
              <div className="mt-6 rounded-2xl border border-white/10 p-4">
                <b>Payment method</b>
                <p className="mt-1 text-sm text-zinc-400">
                  For checkout, billing, donations or paid services, Leo will
                  explain the trade-offs before implementation.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <button
                    onClick={() => setPayment("automatic_paystack")}
                    className={`rounded-xl p-4 text-left ${payment === "automatic_paystack" ? "border-orange-400 bg-orange-500/10" : "border-white/10 bg-white/5"} border`}
                  >
                    <b>Automatic Paystack</b>
                    <p className="text-xs text-zinc-400">
                      Server verification, webhook confirmation and safer
                      pay-and-deliver workflows.
                    </p>
                  </button>
                  <button
                    onClick={() => setPayment("manual_email")}
                    className={`rounded-xl p-4 text-left ${payment === "manual_email" ? "border-orange-400 bg-orange-500/10" : "border-white/10 bg-white/5"} border`}
                  >
                    <b>Manual via Email</b>
                    <p className="text-xs text-zinc-400">
                      Customer sends a payment request by email and the admin
                      can approve manually.
                    </p>
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
          <GlassCard className="p-6">
            <h2 className="text-xl font-bold">Your build brief</h2>
            <p className="mt-2 text-sm text-zinc-400">Leo will use your answers to plan the information architecture, screens, design system and integrations before building. It must not silently substitute a generic template.</p>
            <ul className="mt-4 space-y-3 text-sm text-zinc-300">
              <li>✓ Real business name, text and links</li>
              <li>✓ Explicit visual direction, palette and screen/page requirements</li>
              <li>✓ Data model, roles, integrations and platform targets where relevant</li>
              <li>✓ Real owner/team photos when required</li>
              <li>✓ Real credentials, testimonials and portfolio items</li>
              <li>✓ No invented products, reviews or credentials</li>
              {chatbot && (
                <li>✓ Client’s own OpenAI API key for their chatbot</li>
              )}
              <li>
                ✓{" "}
                {DB_NEEDED.has(type)
                  ? "Database-backed features"
                  : "Email-backed contact flow"}{" "}
                for this website type
              </li>
            </ul>
            <div className="mt-6 rounded-2xl border border-white/10 p-4">
              <b>Build and deployment permission</b>
              <p className="mt-1 text-sm text-zinc-400">Your brief is saved first. Auto-build starts only under the permission you select; provider readiness and the monthly build allowance are checked server-side before execution; platform credits are shown separately in the project workspace. Deployment can still fail if provider credentials or required integrations are unavailable.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([ ["once", "Allow once", "Build and deploy this project after saving."], ["always", "Allow always", "Remember this choice for future website builds on this browser."], ["ask", "Ask every time", "Save the brief and decide before deployment." ] ] as const).map(([value, label, description]) => (
                  <button key={value} type="button" onClick={() => setBuildPolicy(value)} className={`rounded-xl border p-3 text-left ${buildPolicy === value ? "border-orange-400 bg-orange-500/10" : "border-white/10 bg-white/[.03]"}`}>
                    <span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-zinc-400">{description}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              disabled={!business || (!isCloudProject && chatbot === null) || saving}
              onClick={async () => {
                if (saving) return;
                setSaving(true);
                try {
                  const supabase = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                  );
                  const session = (await supabase.auth.getSession()).data.session;
                  if (!session) throw new Error("Please sign in to save this project.");
                  const r = await fetch("/api/setup/projects", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                      website_type: type,
                                            project_type: projectType,
                      business_name: business,
                      chatbot_enabled: chatbot === true,
                      payment_mode: payment || "manual_email",
                      requirements: Object.fromEntries(
                        [
                          ...questions.map((q, i) => [q, answers[i] || ""]),
                          ...(selectedTemplate
                            ? [["template_id", selectedTemplate.id], ["template_name", selectedTemplate.name]]
                            : []),
                        ],
                      ),
                    }),
                  });
                  const j = await r.json();
                  if (!r.ok || !j.project) throw new Error(j.error || "Could not save project.");
                  if (buildPolicy === "always") window.localStorage.setItem("leonardx_build_policy", "always");
                  else window.localStorage.removeItem("leonardx_build_policy");
                  if (projectType === "mobile_app" && buildPolicy !== "ask") {
                    const buildRequest = { project_id: j.project.id, platform: "android", profile: "preview", idempotency_key: window.crypto.randomUUID() };
                    const buildResponse = await fetch("/api/builds/expo", {
                      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(buildRequest),
                    });
                    const buildResult = await buildResponse.json().catch(() => ({}));
                    if (!buildResponse.ok) alert(`Project saved, but the mobile build could not start: ${buildResult.error || "Check Expo setup and project identifiers."}`);
                    else alert(`Mobile build submitted. Status: ${buildResult.status || "queued"}. Open the workspace to follow progress.`);
                  }
                  const canAutoBuild = !isCloudProject && buildPolicy !== "ask";
                  router.push(projectType === "game" ? `/app/game-studio?project_id=${encodeURIComponent(j.project.id)}` : canAutoBuild ? `/dashboard/websites/${j.project.id}?auto_build=1` : projectType === "mobile_app" ? `/ide/${j.project.id}` : `/dashboard/websites/${j.project.id}`);
                } catch (error) {
                  alert(error instanceof Error ? error.message : "Could not save project.");
                  setSaving(false);
                }
              }}
              className="mt-6 w-full rounded-full bg-orange-500 p-3 font-bold disabled:opacity-40"
            >
              {saving ? "Saving project…" : projectType === "game" ? "Create browser game" : buildPolicy === "ask" ? "Save project brief" : "Save, build & deploy"}
            </button>
          </GlassCard>
        </div>
      )}
    </main>
  );
}
