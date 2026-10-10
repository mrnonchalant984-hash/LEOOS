'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Copy, ExternalLink, Pause, Play, RotateCcw, TerminalSquare } from 'lucide-react';
import { clampStudioStep, integrationModes, integrationScenarios, isFocusedStudioLine, type IntegrationKind } from '@/lib/integration-studio';

export function IntegrationStudio({ initialIntegration = 'api' }: { initialIntegration?: IntegrationKind }) {
  const pathname = usePathname();
  const [integration, setIntegration] = useState<IntegrationKind>(initialIntegration);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');

  const scenarios = integrationScenarios[integration];
  const scenario = scenarios[scenarioIndex] ?? scenarios[0];
  const step = scenario.steps[stepIndex] ?? scenario.steps[0];
  const mode = integrationModes.find(item => item.id === integration) ?? integrationModes[0];
  const codeLines = useMemo(() => step.code.split('\n'), [step.code]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    let current = stepIndex;
    const timer = window.setInterval(() => {
      current = clampStudioStep(current + 1, scenario.steps.length);
      setStepIndex(current);
      if (current >= scenario.steps.length - 1) {
        setCompleted(true);
        window.clearInterval(timer);
        setPlaying(false);
      }
    }, 2600);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, scenario.steps.length, stepIndex]);

  function selectIntegration(next: IntegrationKind) {
    setPlaying(false);
    setCompleted(false);
    setIntegration(next);
    setScenarioIndex(0);
    setStepIndex(0);
    setCopyMessage('');
  }

  function selectScenario(index: number) {
    setPlaying(false);
    setCompleted(false);
    setScenarioIndex(index);
    setStepIndex(0);
    setCopyMessage('');
  }

  function moveStep(direction: -1 | 1) {
    setPlaying(false);
    const next = clampStudioStep(stepIndex + direction, scenario.steps.length);
    setStepIndex(next);
    setCompleted(direction > 0 && next === scenario.steps.length - 1);
  }

  function togglePlayback() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setCompleted(false);
    if (stepIndex >= scenario.steps.length - 1) setStepIndex(0);
    setPlaying(true);
  }

  function restartWalkthrough() {
    setPlaying(false);
    setCompleted(false);
    setStepIndex(0);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(step.code);
      setCopyMessage('Code copied to clipboard.');
    } catch {
      setCopyMessage('Clipboard access is unavailable. Select and copy the code manually.');
    }
  }

  const backHref = pathname === '/developers' ? '/docs/api' : '/developers';
  const backLabel = pathname === '/developers' ? 'Return to API docs' : 'Back to developer platform';
  const tourComplete = completed || scenario.steps.length === 1;

  return <section aria-label="Integration Studio" className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#090a0c] shadow-[0_28px_90px_rgba(0,0,0,.28)]">
    <div className="border-b border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(212,175,55,.09),transparent_42%)] px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/20 bg-amber-100/[.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[.17em] text-amber-100/85"><TerminalSquare size={13}/> Integration Studio</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[.13em] text-zinc-400">Simulation · no request sent</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Follow the integration, one step at a time.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Explore real LeonardX contracts with sample code and a simulated terminal. This walkthrough never uses credentials, contacts endpoints, or changes account data.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-400"><span className="h-2 w-2 rounded-full bg-amber-200/70" aria-hidden="true"/> Source-backed examples</div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Choose an integration">
        {integrationModes.map(item => <button key={item.id} type="button" aria-pressed={integration === item.id} onClick={() => selectIntegration(item.id)} className={`rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${integration === item.id ? 'border-amber-100/35 bg-amber-100/[.09] text-amber-50' : 'border-white/10 bg-white/[.025] text-zinc-400 hover:border-white/20 hover:text-white'}`}>
          {item.label}
        </button>)}
      </div>
    </div>

    <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
      <div className="min-w-0 border-b border-white/10 p-4 sm:p-6 lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-500">Walkthrough scenario</p>
            <p className="mt-1 text-xs text-zinc-400">{scenario.description}</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Choose a walkthrough scenario">
            {scenarios.map((item, index) => <button key={item.id} type="button" aria-pressed={scenarioIndex === index} onClick={() => selectScenario(index)} className={`rounded-md border px-2.5 py-1.5 text-[10px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${scenarioIndex === index ? 'border-white/20 bg-white/[.08] text-white' : 'border-white/10 text-zinc-500 hover:text-zinc-200'}`}>
              {item.label}
            </button>)}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{step.title}</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-400">{step.description}</p>
          </div>
          <button type="button" onClick={copyCode} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-medium text-zinc-300 transition-colors motion-reduce:transition-none hover:border-amber-100/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200" aria-label="Copy the current code example">
            {copyMessage.startsWith('Code copied') ? <Check size={13}/> : <Copy size={13}/>}<span>{copyMessage.startsWith('Code copied') ? 'Copied' : 'Copy code'}</span>
          </button>
        </div>
        {copyMessage && <p role="status" aria-live="polite" className="mt-2 text-[10px] text-amber-100/80">{copyMessage}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#050607]">
          <div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3 text-[10px] text-zinc-500">
            <span className="font-mono">{step.fileName}</span><span>{stepIndex + 1} / {scenario.steps.length}</span>
          </div>
          <pre aria-label={`Code example, ${step.fileName}`} className="max-h-[360px] overflow-auto py-3 text-[11px] leading-6 sm:text-xs"><code>{codeLines.map((line, index) => {
            const lineNumber = index + 1;
            const focused = isFocusedStudioLine(lineNumber, step.focusLines);
            return <span key={`${step.id}-${lineNumber}`} className={`flex min-w-max px-3 font-mono ${focused ? 'bg-amber-200/[.08] text-zinc-100' : 'text-zinc-500'}`}><span className="mr-4 inline-block w-5 select-none text-right text-zinc-700" aria-hidden="true">{lineNumber}</span><span>{line || ' '}</span></span>;
          })}</code></pre>
        </div>
      </div>

      <div className="min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-500">Execution preview</p><p className="mt-1 text-xs text-zinc-400">Synchronized to the highlighted code</p></div>
          <span className="rounded-md border border-amber-100/15 bg-amber-100/[.05] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-amber-100/75">{step.outputLabel}</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#050607]">
          <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-3"><span className="h-2 w-2 rounded-full bg-white/20"/><span className="h-2 w-2 rounded-full bg-white/20"/><span className="h-2 w-2 rounded-full bg-white/20"/><span className="ml-2 text-[10px] text-zinc-500">leo · {integration}</span><span className="ml-auto rounded border border-amber-100/15 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-amber-100/70">simulated</span></div>
          <div role="log" aria-label="Simulated terminal output" aria-live="polite" className="min-h-[226px] space-y-2 overflow-x-auto p-4 font-mono text-[10px] leading-5 sm:text-[11px]">
            {step.terminal.map((line, index) => <p key={`${step.id}-out-${index}`} className={`${line.startsWith('[SIMULATION]') ? 'text-amber-100/80' : line.startsWith('Error:') || line.startsWith('HTTP 403') ? 'text-rose-200/80' : 'text-zinc-300'}`}>{line}</p>)}
            <p className="pt-2 text-zinc-600" aria-hidden="true">$ <span className="inline-block h-3 w-1.5 translate-y-0.5 bg-amber-100/40 motion-reduce:animate-none"/></p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[.08] bg-white/[.02] p-3 text-xs leading-5 text-zinc-400">
          <strong className="font-semibold text-zinc-200">What is live?</strong> The examples describe existing API, SDK, CLI, and webhook behavior. This preview itself is local UI only and does not report a real execution.
        </div>
      </div>
    </div>

    <div className="border-t border-white/10 bg-white/[.015] px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => moveStep(-1)} disabled={stepIndex === 0} aria-label="Previous walkthrough step" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-300 transition-colors motion-reduce:transition-none hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={13}/> Previous</button>
          <button type="button" onClick={togglePlayback} disabled={reducedMotion || scenario.steps.length < 2} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'} className="inline-flex items-center gap-2 rounded-lg border border-amber-100/25 bg-amber-100/[.08] px-3 py-2 text-[10px] font-semibold text-amber-50 transition-colors motion-reduce:transition-none hover:bg-amber-100/[.13] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
            {playing ? <Pause size={13}/> : <Play size={13}/>} {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={restartWalkthrough} aria-label="Restart walkthrough" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-300 transition-colors motion-reduce:transition-none hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><RotateCcw size={13}/> Restart</button>
          <button type="button" onClick={() => moveStep(1)} disabled={stepIndex >= scenario.steps.length - 1} aria-label="Next walkthrough step" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-300 transition-colors motion-reduce:transition-none hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">Next <ArrowRight size={13}/></button>
          {reducedMotion && <span className="text-[10px] text-zinc-500">Auto-play is off because reduced motion is enabled.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={mode.referenceHref} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><BookOpen size={13}/>{mode.referenceLabel}</Link>
          <Link href={mode.secondaryHref} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">{mode.secondaryLabel}<ExternalLink size={12}/></Link>
        </div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[.07]" aria-hidden="true"><div className="h-full bg-amber-100/60 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((stepIndex + 1) / scenario.steps.length) * 100}%` }}/></div>
      <p className="sr-only" aria-live="polite">{scenario.label}: step {stepIndex + 1} of {scenario.steps.length}. {step.title}</p>
      {tourComplete && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200/15 bg-emerald-200/[.035] px-4 py-3">
        <div><p className="text-xs font-semibold text-zinc-100">Walkthrough complete</p><p className="mt-1 text-[10px] text-zinc-400">Illustrative preview only; no live operation was performed.</p></div>
        <Link href={backHref} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-zinc-200 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"><ArrowLeft size={13}/>{backLabel}</Link>
      </div>}
    </div>
  </section>;
}
