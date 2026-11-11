import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { adminSupabase, getProfile } from '@/lib/auth';
import { enforceUserRateLimit } from '@/lib/rate-limit';
import { decodeSkillFileContent, normalizeSkillRelativePath, skillNameSchema, validateSkillFileMap, MAX_SKILL_BUNDLE_BYTES } from '@/lib/skills/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 75;

function getRunnerConfig() {
  const secret = process.env.LEO_SANDBOX_HMAC_SECRET?.trim() || '';
  const configured = process.env.LEO_SANDBOX_URL?.trim() || '';
  if (!secret || secret.length < 32 || !configured) throw new Error('runner_not_configured');
  const url = new URL(configured);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('runner_url_invalid');
  }
  const accessClientId = process.env.LEO_SANDBOX_ACCESS_CLIENT_ID?.trim() || '';
  const accessClientSecret = process.env.LEO_SANDBOX_ACCESS_CLIENT_SECRET?.trim() || '';
  if (Boolean(accessClientId) !== Boolean(accessClientSecret)) throw new Error('runner_access_token_incomplete');
  return { origin: url.origin, secret, accessClientId, accessClientSecret };
}

export async function POST(req: NextRequest) {
  const ctx = await getProfile(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in to run a skill script.' }, { status: 401 });
  const limited = await enforceUserRateLimit(ctx.user.id, 'skill-script-execution', 5, 3600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['name', 'script_path', 'input', 'confirm'].includes(key))) {
    return NextResponse.json({ error: 'Provide a skill name, script path, JSON input, and explicit confirmation.' }, { status: 400 });
  }
  if (body.confirm !== true) return NextResponse.json({ error: 'Confirm skill script execution before running it.' }, { status: 400 });
  let name: string;
  try { name = skillNameSchema.parse(body.name); }
  catch { return NextResponse.json({ error: 'Skill name is invalid.' }, { status: 400 }); }
  const scriptPath = normalizeSkillRelativePath(body.script_path);
  if (!scriptPath || scriptPath !== body.script_path || !/^scripts\/[^/]+(?:\/[^/]+)*\.(?:mjs|cjs|js)$/i.test(scriptPath)) {
    return NextResponse.json({ error: 'Choose a JavaScript file under this skill’s scripts/ directory.' }, { status: 400 });
  }
  let inputJson: string;
  try {
    inputJson = JSON.stringify(body.input ?? {});
    if (Buffer.byteLength(inputJson, 'utf8') > 16 * 1024) throw new Error('too_large');
  } catch {
    return NextResponse.json({ error: 'Skill script input must be JSON and no larger than 16 KB.' }, { status: 400 });
  }
  let runner: { origin: string; secret: string; accessClientId: string; accessClientSecret: string };
  try { runner = getRunnerConfig(); }
  catch { return NextResponse.json({ error: 'Isolated skill execution is not configured. Set LEO_SANDBOX_URL and LEO_SANDBOX_HMAC_SECRET after deploying the gVisor runner.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }

  const db = adminSupabase();
  const { data: skill, error: skillError } = await db.from('skills').select('id,name,enabled')
    .eq('name', name).eq('owner_id', ctx.user.id).eq('source', 'user').maybeSingle();
  if (skillError) return NextResponse.json({ error: 'Skill could not be checked before execution.' }, { status: 503 });
  if (!skill || skill.enabled !== true) return NextResponse.json({ error: 'An enabled, user-owned skill is required to execute scripts.' }, { status: 404 });
  const { data: rows, error: filesError } = await db.from('skill_files').select('path,content')
    .eq('skill_id', skill.id).order('path');
  if (filesError) return NextResponse.json({ error: 'Skill package files could not be loaded.' }, { status: 503 });
  const storedFiles: Record<string, string> = {};
  for (const row of rows || []) {
    if (typeof row.content !== 'string') return NextResponse.json({ error: 'A skill package asset is unavailable.' }, { status: 422 });
    storedFiles[row.path] = row.content;
  }
  let files: Record<string, string>;
  try { files = validateSkillFileMap(Object.fromEntries(Object.entries(storedFiles).filter(([filePath]) => filePath !== 'SKILL.md'))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Skill package is invalid.' }, { status: 422 }); }
  if (typeof storedFiles['SKILL.md'] !== 'string' || typeof files[scriptPath] !== 'string' || files[scriptPath].startsWith('leonardx:base64:')) {
    return NextResponse.json({ error: 'The selected script is not an available text file in this skill.' }, { status: 404 });
  }

  const zip = new JSZip();
  for (const [filePath, content] of Object.entries({ 'SKILL.md': storedFiles['SKILL.md'], ...files })) {
    zip.file(filePath, decodeSkillFileContent(content));
  }
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (archive.byteLength > 4 * 1024 * 1024) return NextResponse.json({ error: 'Skill script workspace exceeds the isolated runner’s 4 MB request limit.' }, { status: 413 });

  const { data: execution, error: executionError } = await db.from('skill_executions').insert({
    owner_id: ctx.user.id, skill_id: skill.id, script_path: scriptPath, status: 'running', stdout: '', stderr: '',
  }).select('id').single();
  if (executionError || !execution) return NextResponse.json({ error: 'Skill execution history is unavailable. Apply the skill lifecycle migration.' }, { status: 503 });

  const startedAt = Date.now();
  const payload = JSON.stringify({
    job_id: randomUUID(),
    tenant_id: ctx.user.id,
    operation: 'run_skill_script',
    workspace_zip_base64: Buffer.from(archive).toString('base64'),
    script_path: scriptPath,
    script_input_json: inputJson,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', runner.secret).update(`${timestamp}.${payload}`).digest('hex');
  try {
    const response = await fetch(`${runner.origin}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Runner-Timestamp': timestamp,
        'X-Runner-Signature': signature,
        ...(runner.accessClientId ? {
          'CF-Access-Client-Id': runner.accessClientId,
          'CF-Access-Client-Secret': runner.accessClientSecret,
        } : {}),
      },
      body: payload,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(65_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== 'object') throw new Error(`runner_http_${response.status}`);
    const stdout = typeof result.stdout === 'string' ? result.stdout.slice(-24_000) : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr.slice(-12_000) : '';
    const exitCode = typeof result.exit_code === 'number' ? result.exit_code : null;
    const status = result.ok === true ? 'succeeded' : exitCode === 124 ? 'timed_out' : 'failed';
    const durationMs = Math.min(Date.now() - startedAt, 65_000);
    const { error: saveError } = await db.from('skill_executions').update({
      status, exit_code: exitCode, stdout, stderr, duration_ms: durationMs, completed_at: new Date().toISOString(),
    }).eq('id', execution.id).eq('owner_id', ctx.user.id);
    if (saveError) return NextResponse.json({ error: 'Skill result completed but its execution log could not be saved.' }, { status: 503 });
    return NextResponse.json({ execution_id: execution.id, status, exit_code: exitCode, stdout, stderr, duration_ms: durationMs }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const durationMs = Math.min(Date.now() - startedAt, 65_000);
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    const status = timedOut ? 'timed_out' : 'failed';
    await db.from('skill_executions').update({ status, stderr: timedOut ? 'skill_execution_timeout' : 'isolated_runner_unavailable', duration_ms: durationMs, completed_at: new Date().toISOString() })
      .eq('id', execution.id).eq('owner_id', ctx.user.id);
    console.error('Isolated skill execution failed', { userId: ctx.user.id, skillId: skill.id, error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ execution_id: execution.id, status, error: timedOut ? 'Skill script exceeded the 60-second execution limit.' : 'The isolated skill runner did not complete the request.' }, { status: timedOut ? 504 : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
