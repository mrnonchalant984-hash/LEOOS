"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { useEffect, useRef } from "react";
import DesignWorldScene from "@/components/DesignWorldScene";

const ABOUT_VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260823_063501_2e2c8971-de1e-473a-8611-a0c9ae7ee186.mp4";

function ResilientVideo({ src, className, preload = "metadata" }: { src: string; className?: string; preload?: "none" | "metadata" }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const play = () => {
      video.muted = true;
      void video.play().catch(() => undefined);
    };
    let attempts = 0;
    let retry: number | undefined;
    const retryPlay = () => {
      if (attempts >= 3 || !video.paused) return;
      attempts += 1;
      play();
      if (video.paused) retry = window.setTimeout(retryPlay, 1500);
    };
    document.addEventListener("pointerdown", play, { once: true, passive: true });
    retryPlay();
    return () => {
      if (retry) window.clearTimeout(retry);
      document.removeEventListener("pointerdown", play);
    };
  }, []);

  return <video ref={ref} className={className} src={src} autoPlay muted loop playsInline preload={preload} aria-hidden="true" />;
}

export default function LeonardXEditorialHero() {
  return (
    <>
      <section className="lx-editorial-hero" aria-labelledby="lx-hero-title">
        <DesignWorldScene />
        <div className="lx-editorial-hero-scrim" aria-hidden="true" />
        <div className="lx-editorial-hero-content">
          <p className="lx-editorial-kicker">AI SOFTWARE CREATION PLATFORM</p>
          <h1 id="lx-hero-title"><span>BUILD WHAT YOU</span><span>IMAGINE.</span></h1>
          <p className="lx-editorial-lead">Turn an idea into working software with Leo, project workspaces and a connected path from planning to deployment.</p>
          <div className="lx-editorial-actions">
            <Link href="/app" className="lx-cyan-button">START BUILDING <ArrowRight size={16} /></Link>
            <Link href="#story" className="lx-editorial-outline"><Play size={14} /> EXPLORE THE PLATFORM</Link>
          </div>
          <div className="lx-editorial-proof"><span>NO CREDIT CARD REQUIRED</span><span>FREE TEMPLATES</span><span>BUILT FOR DEVELOPERS</span></div>
        </div>
        <div className="lx-editorial-telemetry" aria-hidden="true"><span>PROJECT DEPLOYED</span><b>LIVE</b><small>Build → Test → Deploy</small></div>
      </section>

      <section id="story" className="lx-editorial-about" aria-labelledby="lx-about-title">
        <div className="lx-editorial-about-copy">
          <p className="lx-editorial-kicker">THE LEONARDX WORKSPACE</p>
          <h2 id="lx-about-title"><span>FROM IDEA</span><span>TO PRODUCT.</span></h2>
          <p>LeonardX gives modern builders a clear place to plan, build, test and improve software. Leo helps structure the work while the platform keeps project context, files, integrations and delivery state connected.</p>
          <Link href="/about" className="lx-cyan-button">MEET LEONARD <ArrowRight size={16} /></Link>
        </div>
        <div className="lx-editorial-about-media">
          <ResilientVideo src={ABOUT_VIDEO} className="lx-editorial-about-video" preload="none" />
          <div className="lx-editorial-about-tint" aria-hidden="true" />
        </div>
      </section>
    </>
  );
}
