# LEO OS PageSpeed Optimization Report

## Baseline supplied for this pass

The supplied PageSpeed report measured the production homepage at 43 mobile performance and 94 desktop performance. Mobile diagnostics were FCP 3.1 s, LCP 4.8 s, TBT 3,060 ms, Speed Index 5.4 s, CLS 0.01, approximately 432 KiB of unused JavaScript, 1.8 s of JavaScript execution, 14.6 s of main-thread work, and 20 long tasks. Accessibility and SEO were both reported as 100; Best Practices was 92.

These values are the provided baseline. A comparable post-change PageSpeed run has not yet been completed, so no improvement percentage or new score is claimed here.

## Evidence inspected

- `app/layout.tsx`: mounted the 3D background, global Leo launcher, observability clients, and a global AdSense script on every route.
- `components/VisualBackground.tsx`: dynamically loaded the R3F scene for non-workspace routes after a timer, including mobile visitors.
- `components/Background3D.tsx`: loaded React Three Fiber, drei, Three.js geometry, stars, sparkles, and animated frame work.
- `components/LeonardXEditorialHero.tsx`: used two external autoplay videos and an unbounded one-second playback retry interval.
- `app/page.tsx`: retained the previous R3F `LandingExperience` inside a CSS-hidden legacy hero.
- Live production browser inspection: the page emitted report-only frame-policy messages for `googleads.g.doubleclick.net`; the global AdSense script was the relevant unnecessary third-party load found in the repository.

## Changes implemented

1. Removed the hidden `LandingExperience` mount from the homepage. The legacy markup remains isolated by the existing CSS for compatibility, but the heavy R3F component is no longer imported or instantiated.
2. Disabled the detailed background 3D scene on viewports at or below 700px and for reduced-motion users. Those users receive the existing lightweight CSS atmosphere instead.
3. Scheduled desktop public-page background 3D loading with `requestIdleCallback` (with a bounded timeout fallback), so it does not compete with initial rendering.
4. Changed the below-the-fold editorial video to `preload="none"`.
5. Replaced the editorial video hero with the integrated Design World WebGL scene: a canvas-rendered headline, loaded GLB cube with rounded-box fallback, two-pass screen-space refraction, chromatic dispersion, drag rotation, inertia, arrow rotation, visibility pausing, and reduced-motion support.
6. Kept the secondary About video deferred with `preload="none"`, bounded its playback retries, and disabled autoplay retry for reduced-motion users.
7. Removed the global AdSense script because no ad slot is implemented in the repository. This prevents a third-party script from loading on authenticated/workspace pages and removes the observed global frame-policy noise. If ads are added later, the script should be loaded only by the route containing a real ad slot and with the provider policy updated deliberately.

## Validation

- `npm test`: passed. The current test runner reported 10 passing tests.
- Focused ESLint run: passed after fixing a direct state update inside the new effect.
- `npm run typecheck`: passed; Next route types generated successfully and TypeScript exited cleanly.
- `npm run build`: not yet rerun after the changes.
- PageSpeed/Lighthouse after-change measurement: not yet run.

## Remaining risks and next measurement

The integrated hero still loads an external GLB model and Three.js runtime on the homepage. A production comparison should be run with the same mobile profile after deployment. If LCP or TBT remains above target, the next evidence-based step is to defer the GLB until idle on mobile and measure the effect rather than removing the visual experience speculatively.

The app still contains many client components and Framer Motion surfaces on authenticated routes. Those should be profiled with a bundle treemap before broader refactoring; no speculative dependency removal was made in this pass.

No claims are made here about reaching the target of mobile 90+, LCP ≤ 2.5 s, or TBT ≤ 200 ms until a comparable PageSpeed run verifies them.
