import { createHmac, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { adminSupabase } from '@/lib/auth';
import { getMainWebsiteGitHubToken } from '@/lib/mcp/github-app-auth';

export type PrivateRuntimeKind = 'leocode' | 'skill' | 'repository' | 'workspace';
const OPERATIONS = new Set(['inspect','install','test','typecheck','lint','build','git_status','git_diff','run_skill','run_code','repo_status','repo_diff','repo_install','repo_test','repo_build']);

export async function dispatchPrivateRuntimeJob(input: {
  ownerId: string; kind: PrivateRuntimeKind; operation: string; projectId?: string | null;
  archive: Buffer; metadata?: Record<string, unknown>; maxBytes?: number;
}) {
  if (!OPERATIONS.has(input.operation)) throw new Error('Unsupported runtime operation.');
  const maxBytes = input.maxBytes ?? 4 * 1024 * 1024;
  if (!input.archive.length || input.archive.length > maxBytes) throw new Error(`Runtime payload must be between 1 byte and ${maxBytes} bytes.`);
  const owner = (process.env.LEO_WORKSPACE_GITHUB_OWNER || 'mrnonchalant984-hash').trim();
  const repository = (process.env.LEO_WORKSPACE_GITHUB_REPOSITORY || 'LEOOS-RUNTIME').trim();
  const workflow = (process.env.LEO_WORKSPACE_GITHUB_WORKFLOW || 'workspace-runtime.yml').trim();
  const ref = (process.env.LEO_WORKSPACE_GITHUB_REF || 'main').trim();
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 32) throw new Error('Configure CRON_SECRET (at least 32 characters) for private runtime hand-off.');
  const token = await getMainWebsiteGitHubToken({ owner, repository, fallbackToken: process.env.GITHUB_TOKEN });
  const check = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store' });
  const info = await check.json().catch(() => null) as { private?: boolean } | null;
  if (!check.ok || info?.private !== true) throw new Error('The configured GitHub Actions runtime repository must exist and be private.');
  const db = adminSupabase();
  const jobId = randomUUID();
  const expiresAt = String(Math.floor(Date.now()/1000)+600);
  const storagePath = `runtime-jobs/${input.ownerId}/${jobId}.zip`;
  const upload = await db.storage.from('leo-files').upload(storagePath, input.archive, { contentType:'application/zip', upsert:false, cacheControl:'private, no-store' });
  if (upload.error) throw new Error('Private runtime payload could not be stored.');
  const { error: insertError } = await db.from('private_runtime_jobs').insert({ id:jobId, owner_id:input.ownerId, project_id:input.projectId || null, kind:input.kind, operation:input.operation, status:'queued', storage_path:storagePath, metadata:input.metadata || {}, expires_at:new Date(Number(expiresAt)*1000).toISOString() });
  if (insertError) { await db.storage.from('leo-files').remove([storagePath]); throw new Error('Runtime job could not be recorded. Apply the private runtime jobs migration.'); }
  const payload = [jobId,input.ownerId,input.kind,input.operation,expiresAt].join('.');
  const signature = createHmac('sha256',secret).update(payload).digest('hex');
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method:'POST', headers:{ Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json' },
    body:JSON.stringify({ ref, inputs:{ job_id:jobId, owner_id:input.ownerId, kind:input.kind, operation:input.operation, expires_at:expiresAt, ticket_signature:signature } }), cache:'no-store', signal:AbortSignal.timeout(15000),
  });
  if (response.status !== 204) {
    await db.from('private_runtime_jobs').update({status:'failed',error:'GitHub Actions dispatch failed.'}).eq('id',jobId);
    throw new Error(`GitHub Actions dispatch failed (HTTP ${response.status}). Verify App Actions:write access and workflow configuration.`);
  }
  return { job_id:jobId,status:'queued',provider:'github_actions',kind:input.kind,operation:input.operation };
}

export async function createRuntimeArchive(files: Record<string,string>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    if (!path || path.startsWith('/') || path.split('/').some(p=>!p || p==='..') || /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(path)) throw new Error('Runtime payload contains an unsafe path.');
    if (typeof content !== 'string' || Buffer.byteLength(content)>1024*1024) throw new Error('Runtime files must be text and no larger than 1 MB each.');
    zip.file(path,content);
  }
  return Buffer.from(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:5}}));
}
