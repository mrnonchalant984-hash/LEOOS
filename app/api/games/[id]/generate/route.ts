import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase, getProfile, isPlatformOwner } from '@/lib/auth';
import { getEffectiveUserPlan, planAllowsCloudProject } from '@/lib/plan-access';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { generateText, getDefaultTextModel } from '@/lib/ai/provider-registry';
import { getSafeFallbackModel, generateWithExplicitFallback } from '@/lib/ai/provider-fallback';
import { isProviderConfigured } from '@/lib/ai/model-catalog';
import { normalizeIdePath, validateIdeFiles } from '@/lib/ide-files';
import { gameFileValidationErrors, gameJavaScriptSyntaxErrors, parseGeneratedGameFiles } from '@/lib/builders/game-generation';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
const MAX_REPAIRS = 2;
const safeError = (error: unknown) => error instanceof Error ? error.message.slice(0, 260) : 'Game generation failed.';

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to generate or repair a game.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'browser-game-generation', 5, 60);
  if (limited) return limited;
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) return NextResponse.json({ error: 'Generation request exceeds the size limit.' }, { status: 413 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid project ID.' }, { status: 400 });
  const body = await req.json().catch(() => null) as { brief?: unknown; mode?: unknown; diagnostics?: unknown } | null;
  const brief = typeof body?.brief === 'string' ? body.brief.trim().slice(0, 12000) : '';
  const mode = body?.mode === 'repair' ? 'repair' : 'generate';
  const diagnostics = Array.isArray(body?.diagnostics) ? body.diagnostics.slice(-20).map(value => String(value).slice(0, 500)) : [];
  if (!brief) return NextResponse.json({ error: 'Describe the intended game before generation.' }, { status: 400 });
  const db = adminSupabase();
  const { data: project, error: projectError } = await db.from('projects')
    .select('id,user_id,project_name,type,files,game_repair_attempts')
    .eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (projectError) return NextResponse.json({ error: 'Project storage is unavailable. Apply the browser-game migration and retry.' }, { status: 503 });
  if (!project || project.type !== 'game') return NextResponse.json({ error: 'Browser game project not found in this account.' }, { status: 404 });
  const owner = isPlatformOwner(ctx.profile);
  const plan = await getEffectiveUserPlan(ctx.user.id, owner);
  if (!planAllowsCloudProject(plan, 'game', owner)) return NextResponse.json({ error: 'Browser-game generation is not included in the current plan. No AI generation was started.', upgrade_url: '/pricing' }, { status: 403 });
  if (!validateIdeFiles(project.files)) return NextResponse.json({ error: 'Existing project files are invalid; generation was stopped safely.' }, { status: 422 });
  if (mode === 'generate') {
    const { data: reserved, error: reservationError } = await db.rpc('reserve_browser_game_generation', { p_project_id: id, p_user_id: ctx.user.id, p_monthly_limit: Math.max(0, Math.trunc(plan.limits.monthlyBuilds || 0)) });
    if (reservationError) return NextResponse.json({ error: 'Monthly game-build allowance could not be reserved. Apply the Browser Game Studio migration and retry.' }, { status: 503 });
    if (reserved !== true) return NextResponse.json({ error: 'The monthly browser-game build allowance has been reached for this plan.', upgrade_url: '/pricing' }, { status: 429 });
  }
  if (mode === 'repair') {
    const attempts = Number(project.game_repair_attempts || 0);
    if (attempts >= MAX_REPAIRS) return NextResponse.json({ error: 'Automatic repair limit reached (2 attempts). Review diagnostics and edit the source manually before trying again.' }, { status: 409 });
    const { data: reserved, error: reserveError } = await db.from('projects').update({ game_repair_attempts: attempts + 1 })
      .eq('id', id).eq('user_id', ctx.user.id).eq('game_repair_attempts', attempts).select('id').maybeSingle();
    if (reserveError || !reserved) return NextResponse.json({ error: 'A repair is already running or the repair counter migration is not applied. Refresh and retry.' }, { status: 409 });
  }
  const model = getDefaultTextModel('chat');
  const fallback = getSafeFallbackModel(model, process.env.LEO_FALLBACK_MODEL?.trim());
  if (!isProviderConfigured(model.split('/')[0] as 'google' | 'openai' | 'anthropic' | 'local') && !fallback) {
    return NextResponse.json({ error: 'The configured Leo AI provider is unavailable. Configure the existing server-side model provider; no game files were changed.' }, { status: 503 });
  }
  const currentFiles = Object.fromEntries(Object.entries(project.files).filter(([path]) => path !== 'leonardx.publication.json' && !/(^|\/)(?:\.env|\.vercel|\.git|node_modules)(?:\/|$)/i.test(path)));
  const { data: assetRows } = await db.from('media_assets').select('metadata,mime_type,size_bytes').eq('user_id', ctx.user.id).eq('bucket','leo-files').contains('metadata',{project_id:id}).order('created_at',{ascending:false}).limit(30);
  const assetManifest = (assetRows || []).map(asset => ({ path: typeof asset.metadata?.project_path === 'string' ? asset.metadata.project_path : null, name: typeof asset.metadata?.original_name === 'string' ? asset.metadata.original_name : 'Asset', mime_type: asset.mime_type, size_bytes: asset.size_bytes })).filter(asset => asset.path);
  const system = `You are Leo, the project-specific browser game engineer inside LeonardX. Generate actual, runnable game source code—not a plan, not a static mockup, and not one fixed template. Infer 2D or 3D, mechanics, controls, HUD, win/lose states, collision/physics and responsive/mobile controls from the user's exact brief. Use Canvas for 2D; use Three.js via an explicit browser module import only when a 3D scene materially requires it. Prefer self-contained HTML/CSS/JS, procedural original art and no external dependencies unless required. Never include secrets, authentication, API calls, telemetry, or access to the parent LeonardX page. The preview runs in a sandboxed iframe with no same-origin privileges. If supplied project assets are relevant, reference them by exact relative paths such as assets/<uuid>.png; those files are included in exports. Return only JSON: {"files":[{"path":"index.html","content":"complete runnable HTML"},{"path":"src/main.js","content":"..."},{"path":"README.md","content":"..."}],"summary":"..."}. All file paths must be relative and safe. index.html must be complete and directly runnable. Keep the total output under 180 KB and use at most 12 files.`;
  const user = mode === 'repair'
    ? `Repair this existing browser game based on the real preview diagnostics. Preserve the requested gameplay and change only files needed to fix these issues. Do not claim browser testing was run.\nGAME BRIEF:\n${brief}\nDIAGNOSTICS:\n${diagnostics.join('\n') || 'User requested a targeted repair; no diagnostics were attached.'}\nCURRENT FILES:\n${JSON.stringify(currentFiles).slice(0, 45_000)}\nAVAILABLE PRIVATE PROJECT ASSETS (use only when helpful):\n${JSON.stringify(assetManifest)}`
    : `Generate a playable, project-specific browser game for this brief. Include working input, real gameplay state, collision rules where relevant, restart, responsive canvas/layout and clear controls. Do not use placeholder text instead of implementing mechanics.\nPROJECT: ${project.project_name}\nBRIEF:\n${brief}\nEXISTING FILES (reuse useful assets/config, replace starter files where needed):\n${JSON.stringify(currentFiles).slice(0, 20_000)}\nAVAILABLE PRIVATE PROJECT ASSETS (use only when helpful):\n${JSON.stringify(assetManifest)}`;
  try {
    const outcome = await generateWithExplicitFallback(model, fallback, chosen => generateText({
      model: chosen,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      maxOutputTokens: 16000,
      temperature: 0.25,
    }));
    const generated = parseGeneratedGameFiles(outcome.result.text);
    const errors = [...gameFileValidationErrors(generated), ...gameJavaScriptSyntaxErrors(generated)];
    if (errors.length) return NextResponse.json({ error: 'Generated files did not pass structural validation.', diagnostics: errors, files_saved: false }, { status: 422 });
    // Reject project-file paths that are valid in the general IDE but unsafe for a game export.
    if (Object.keys(generated).some(path => !normalizeIdePath(path))) return NextResponse.json({ error: 'Generated file paths were rejected. No files were saved.' }, { status: 422 });
    const merged = { ...project.files, ...generated };
    if (!validateIdeFiles(merged)) return NextResponse.json({ error: 'Generated files exceed workspace size limits. No files were saved.' }, { status: 413 });
    const { data: saved, error: saveError } = await db.from('projects').update({ files: merged, status: 'draft', progress: 30 })
      .eq('id', id).eq('user_id', ctx.user.id).select('id').maybeSingle();
    if (saveError || !saved) return NextResponse.json({ error: 'Generated code could not be saved to the owned project. No success is claimed.' }, { status: 503 });
    if (outcome.result.usage) {
      try {
        await db.from('ai_usage').insert({ user_id: ctx.user.id, feature: mode === 'repair' ? 'browser_game_repair' : 'browser_game_generation', model: `${outcome.result.provider}/${outcome.result.model}`, prompt_tokens: outcome.result.usage.inputTokens, completion_tokens: outcome.result.usage.outputTokens, total_tokens: outcome.result.usage.totalTokens, credits_used: 0, metadata: { project_id: id, provider: outcome.result.provider, repair_attempt: mode === 'repair' } });
      } catch {
        // Usage telemetry is best-effort; source persistence has already been verified.
      }
    }
    return NextResponse.json({ success: true, project_id: id, files_saved: Object.keys(generated).length, total_files: Object.keys(merged).length, model: `${outcome.result.provider}/${outcome.result.model}`, fallback_used: outcome.fallback_used, summary: (() => { try { const raw = JSON.parse(outcome.result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); return typeof raw.summary === 'string' ? raw.summary.slice(0, 1000) : 'Project-specific source generated and saved.'; } catch { return 'Project-specific source generated and saved.'; } })(), diagnostics: [], browser_tested: false, deployed: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: safeError(error), files_saved: false, deployed: false }, { status: 502 });
  }
}
