import JSZip from 'jszip';
import { normalizeIdePath } from './ide-files.ts';

export const MAX_WORKSPACE_EXPORT_FILES = 250;
export const MAX_WORKSPACE_EXPORT_BYTES = 2_000_000;

const SENSITIVE_PATH = /(^|\/)(?:\.env(?!\.example(?:\/|$))(?:\.[^/]*)?|\.vercel|\.git|\.npmrc|\.netrc|\.pypirc|\.aws|\.ssh|\.kube|\.docker|node_modules|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|private[-_]?key(?:\.[^/]*)?|id_rsa|id_ed25519|[^/]+\.(?:pem|key|p12|pfx))(?:\/|$)/i;
const SECRET_CONTENT = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b|(?:api[_-]?key|secret|token|password|client[_-]?secret|private[_-]?key|service[_-]?role)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i;

export class WorkspaceExportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WorkspaceExportError';
    this.status = status;
  }
}

export function selectWorkspaceExportFiles(files: Record<string, string>, selectors: string[] = []) {
  if (Object.keys(files).length > MAX_WORKSPACE_EXPORT_FILES) {
    throw new WorkspaceExportError('This workspace has too many files to export in one request.', 413);
  }
  let totalBytes = 0;
  for (const [filePath, content] of Object.entries(files)) {
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > MAX_WORKSPACE_EXPORT_BYTES) {
      throw new WorkspaceExportError('This workspace exceeds the bounded 2 MB project export limit.', 413);
    }
    if (!normalizeIdePath(filePath) || normalizeIdePath(filePath) !== filePath) {
      throw new WorkspaceExportError('The workspace contains an unsafe file path and cannot be exported.', 422);
    }
  }

  if (selectors.length > MAX_WORKSPACE_EXPORT_FILES) {
    throw new WorkspaceExportError('Select no more than 250 files or folders per export.', 400);
  }
  const selected = new Set<string>();
  if (!selectors.length) {
    Object.keys(files).forEach(filePath => selected.add(filePath));
  } else {
    for (const rawSelector of selectors) {
      const selector = normalizeIdePath(rawSelector);
      if (!selector || selector !== rawSelector) throw new WorkspaceExportError('A selected path is invalid.', 400);
      if (Object.hasOwn(files, selector)) {
        selected.add(selector);
        continue;
      }
      const matching = Object.keys(files).filter(filePath => filePath.startsWith(`${selector}/`));
      if (!matching.length) throw new WorkspaceExportError('A selected file or folder was not found.', 404);
      matching.forEach(filePath => selected.add(filePath));
    }
  }

  const safeFiles: Record<string, string> = {};
  let omittedSensitiveFiles = 0;
  for (const filePath of selected) {
    const content = files[filePath];
    if (SENSITIVE_PATH.test(filePath) || SECRET_CONTENT.test(content)) {
      omittedSensitiveFiles += 1;
      continue;
    }
    safeFiles[filePath] = content;
  }
  if (!Object.keys(safeFiles).length) {
    throw new WorkspaceExportError('No exportable files were found in this selection.', 422);
  }
  return { files: safeFiles, omittedSensitiveFiles };
}

function safeArchiveName(value: string) {
  return value.normalize('NFKC').replace(/[^a-z0-9._-]+/gi, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'workspace';
}

export async function createWorkspaceZip(projectName: string, files: Record<string, string>) {
  const zip = createZip(projectName, files);
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function createWorkspaceZipStream(projectName: string, files: Record<string, string>) {
  return createZip(projectName, files).generateNodeStream({
    type: 'nodebuffer',
    streamFiles: true,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function createZip(projectName: string, files: Record<string, string>) {
  const zip = new JSZip();
  const folder = zip.folder(safeArchiveName(projectName));
  if (!folder) throw new WorkspaceExportError('The project archive could not be created.', 500);
  for (const [filePath, content] of Object.entries(files)) folder.file(filePath, content);
  return zip;
}

export function workspaceDownloadFilename(projectName: string, extension: 'zip' | 'txt') {
  return `${safeArchiveName(projectName)}.${extension}`;
}

export function workspaceFileDownloadFilename(filePath: string) {
  const fileName = filePath.split('/').at(-1) || 'file';
  return fileName.normalize('NFKC').replace(/[^a-z0-9._-]+/gi, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 120) || 'file';
}
