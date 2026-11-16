import JSZip from 'jszip';

export const PROJECT_RUNNER_OPERATIONS = ['install', 'test', 'typecheck', 'lint', 'build'] as const;
export type ProjectRunnerOperation = (typeof PROJECT_RUNNER_OPERATIONS)[number];

/** Queue MCP project operations on the private GitHub Actions runtime. */
export async function runProjectRunnerOperation(input: {
  ownerId: string;
  files: Record<string, unknown>;
  operation: ProjectRunnerOperation;
}) {
  try {
    const zip = new JSZip();
    let count = 0;
    for (const [path, value] of Object.entries(input.files || {})) {
      if (!path || path.startsWith('/') || path.split('/').some((part) => !part || part === '..') || /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(path)) {
        throw new Error('Project contains an unsafe path or secret-like file.');
      }
      if (typeof value !== 'string') continue;
      if (Buffer.byteLength(value) > 1024 * 1024) throw new Error(`Project file ${path} exceeds the 1 MB per-file limit.`);
      zip.file(path, value);
      count += 1;
    }
    if (!count) throw new Error('Project has no text source files to execute.');
    const archive = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 5 } }));
    const { queueGitHubRuntimeJob } = await import('./runtime/github-actions.ts');
    const job = await queueGitHubRuntimeJob({ userId: input.ownerId, kind: 'workspace', operation: input.operation, archive, metadata: { source: 'mcp_project_runner' } });
    return { data: { ...job, status: 'queued', message: 'Project operation queued on an ephemeral GitHub-hosted runner. Poll the runtime job status endpoint for the result.' }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Project operation could not be queued.' };
  }
}
