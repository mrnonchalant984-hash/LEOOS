"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, LoaderCircle } from "lucide-react";

const milestones = [
  { status: "building", title: "Assembling your project" },
  { status: "testing", title: "Checking project files" },
  { status: "deploying", title: "Publishing to production" },
  { status: "live", title: "Verifying the main link" },
];

const cubeFaces = [
  { label: "LEO", transform: "translateZ(34px)" },
  { label: "BUILD", transform: "rotateY(180deg) translateZ(34px)" },
  { label: "CODE", transform: "rotateY(90deg) translateZ(34px)" },
  { label: "SHIP", transform: "rotateY(-90deg) translateZ(34px)" },
  { label: "LIVE", transform: "rotateX(90deg) translateZ(34px)" },
  { label: "WEB", transform: "rotateX(-90deg) translateZ(34px)" },
];

export function BuildProgressVisualizer({
  status,
  step,
}: {
  status: string;
  step: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const activeIndex = milestones.findIndex((milestone) => milestone.status === status);
  const currentIndex = activeIndex < 0 ? 0 : activeIndex;

  return (
    <section
      aria-label="Live project build progress"
      aria-live="polite"
      aria-busy="true"
      role="status"
      className="mt-5 overflow-hidden rounded-2xl border border-[var(--gold)]/20 bg-[radial-gradient(ellipse_at_28%_42%,rgba(212,175,55,.12),transparent_45%),linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.018))] p-5 sm:p-7"
    >
      <div className="grid items-center gap-7 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--gold-bright)]">
            Live build · production deployment
          </p>
          <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">
            Bringing your project to life
          </h3>
          <p className="mt-2 min-h-6 text-sm text-zinc-300">
            {step || "Preparing the project workspace"}
          </p>
          <ol aria-label="Deployment milestones" className="mt-5 grid gap-2 sm:grid-cols-2">
            {milestones.map((milestone, index) => {
              const complete = status === "live" || index < currentIndex;
              const current = status !== "live" && index === currentIndex;
              return (
                <li
                  key={milestone.status}
                  aria-current={current ? "step" : undefined}
                  className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    current
                      ? "border-[var(--gold)]/35 bg-[var(--gold)]/10 text-white"
                      : complete
                        ? "border-emerald-400/20 bg-emerald-400/[.04] text-emerald-100"
                        : "border-white/[.06] bg-black/10 text-zinc-500"
                  }`}
                >
                  {complete ? (
                    <Check size={14} aria-hidden="true" className="shrink-0 text-emerald-300" />
                  ) : current ? (
                    <LoaderCircle size={14} aria-hidden="true" className="shrink-0 animate-spin text-[var(--gold-bright)]" />
                  ) : (
                    <Circle size={14} aria-hidden="true" className="shrink-0 opacity-50" />
                  )}
                  <span className="truncate">{milestone.title}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div
          aria-hidden="true"
          className="relative mx-auto grid h-40 w-40 place-items-center [perspective:700px]"
        >
          <motion.div
            className="absolute inset-3 rounded-full border border-[var(--gold)]/20"
            style={{ transform: "rotateX(66deg)" }}
            animate={reduceMotion !== false ? undefined : { rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-6 rounded-full border border-cyan-300/15"
            style={{ transform: "rotateY(67deg) rotateX(18deg)" }}
            animate={reduceMotion !== false ? undefined : { rotate: -360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="relative h-[68px] w-[68px]"
            style={{ transformStyle: "preserve-3d" }}
            animate={reduceMotion !== false ? undefined : { rotateX: 360, rotateY: 360 }}
            transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          >
            {cubeFaces.map((face) => (
              <div
                key={face.label}
                className="absolute inset-0 grid place-items-center rounded-xl border border-[var(--gold)]/45 bg-[#14130f]/90 text-[9px] font-black tracking-[.18em] text-[var(--gold-bright)] shadow-[inset_0_0_22px_rgba(212,175,55,.12)]"
                style={{ transform: face.transform, backfaceVisibility: "hidden" }}
              >
                {face.label}
              </div>
            ))}
          </motion.div>
          <motion.div
            className="absolute h-28 w-28 rounded-full bg-[var(--gold)]/10 blur-2xl"
            animate={reduceMotion !== false ? undefined : { opacity: [0.3, 0.8, 0.3], scale: [0.8, 1.12, 0.8] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
      <p className="mt-5 border-t border-white/[.07] pt-3 text-xs text-zinc-500">
        The main link appears only after Vercel confirms the production build and the project domain is verified and reachable.
      </p>
    </section>
  );
}
