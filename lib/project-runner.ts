import { createHmac, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { normalizeIdePath, validateIdeFiles } from './ide-files.ts';

export const PROJECT_RUNNER_OPERATIONS = ['install', 'test', 'typecheck', 'lint', 'build'] as const;
export type ProjectRunnerOperation = (typeof PROJECT_RUNNER_OPERATIONS)[number];

export async function runProjectRunnerOperation(input: {
  ownerId: string;
  files: Record<string, string>;
  operation: ProjectRunnerOperation;
}) {
  if (!validateIdeFiles(input.files)) return { data: null, error: 'Project files are invalid or exceed the workspace limit.' };
  if (Object.keys(input.files).some((file) => /^\.env(?:\.|$)/i.test(file) || /\.(?:pem|key)$/i.test(file))) {
    return { data: null, error: 'Project secrets cannot be sent to the runner.' };
  }
  const endpoint = process.env.REPOSITORY_RUNNER_URL?.trim();
  const secret = process.env.RUNNER_HMAC_SECRET || '';
  if (!endpoint || secret.length < 32) return { data: null, error: 'The isolated runner service is not configured.' };
  let base: URL;
  try {
    base = new URL(endpoint);
    if (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && base.hostname === 'localhost')) throw new Error();
    if (base.username || base.password || base.search || base.hash) throw new Error();
  } catch {
    return { data: null, error: 'The isolated runner endpoint is invalid.' };
  }
  const zip = new JSZip();
  for (const [file, contents] of Object.entries(input.files)) {
    const normalized = normalizeIdePath(file);
    if (!normalized || normalized !== file) return { data: null, error: 'Project files contain an unsafe path.' };
    zip.file(file, contents, { createFolders: true });
  }
  let archive: string;
  try { archive = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } }); }
  catch { return { data: null, error: 'Project files could not be packaged.' };
  }
  if (archive.length > 5_500_000) return { data: null, error: 'Project archive exceeds the runner request limit.' };
  const jobId = randomUUID();
  const payload = JSON.stringify({ job_id: jobId, operation: input.operation, workspace_zip_base64: archive });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  try {
    const response = await fetch(new URL('/v1/jobs', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Runner-Timestamp': timestamp, 'X-Runner-Signature': signature },
      body: payload,
      signal: AbortSignal.timeout(640_000),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== 'object') return { data: { job_id: jobId, status: 'failed' }, error: 'The isolated runner rejected the operation.' };
    return { data: { job_id: jobId, ...body }, error: body.ok === false ? 'The project operation failed.' : null };
  } catch {
    return { data: { job_id: jobId, status: 'unknown' }, error: 'The isolated runner timed out or is unavailable. Do not assume the operation succeeded.' };
  }
}
