"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

function LandingExperienceFallback() {
  return (
    <section
      className="landing-visual"
      data-visual-identity="neural-orbit"
      aria-hidden="true"
    >
      <div className="landing-3d-fallback" />
      <div className="landing-visual-glow" />
      <div className="landing-orbit-label label-one">PLAN → BUILD</div>
      <div className="landing-orbit-label label-two">HUMAN APPROVAL</div>
      <div className="landing-orbit-label label-three">BUILD → TEST → DEPLOY</div>
    </section>
  );
}

const AnimatedLandingExperience = dynamic(
  () => import("./LandingExperienceScene"),
  {
    ssr: false,
    loading: LandingExperienceFallback,
  },
);

export default function LandingExperience() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const fallbackTimer = window.setTimeout(() => setReady(true), 1500);
    const idleHandle = idleWindow.requestIdleCallback?.(
      () => {
        window.clearTimeout(fallbackTimer);
        setReady(true);
      },
      { timeout: 1200 },
    );

    return () => {
      window.clearTimeout(fallbackTimer);
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, []);

  return ready ? <AnimatedLandingExperience /> : <LandingExperienceFallback />;
}
