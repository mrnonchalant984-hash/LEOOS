import * as path from 'node:path';
import * as vscode from 'vscode';
import { assertNoWorkspaceSymlinks, getWorkspaceRoot } from '../workspace/context';
import { isSafeWorkspacePath, redactWorkspaceText } from '../workspace/policy';
import { MAX_WORKSPACE_FILE_BYTES } from '../workspace/limits';

export type ReviewSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
export type ReviewKind = 'confirmed_defect' | 'potential_defect' | 'suggestion' | 'uncertain';
export type ReviewFinding = {
  id: string;
  severity: ReviewSeverity;
  filePath: string;
  line: number;
  endLine?: number;
  category: string;
  kind: ReviewKind;
  description: string;
  technicalExplanation: string;
  evidence: string;
  recommendedCorrection: string;
  confidence: number;
  verificationStatus: 'not_verified' | 'verified_by_diagnostic';
  safeFix?: { line: number; originalLine: string; replacementLine: string };
};

export type ReviewReport = {
  id: string;
  scope: 'file' | 'selection' | 'workspace' | 'git_changes';
  createdAt: string;
  filesScanned: number;
  findings: ReviewFinding[];
  diagnosticsCount: number;
  truncated: boolean;
};

const MAX_REVIEW_FILES = 120;
const MAX_REVIEW_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_FINDINGS = 300;

type GitChange = { uri: vscode.Uri };
type GitRepository = {
  state: {
    workingTreeChanges: GitChange[];
    indexChanges: GitChange[];
  };
};
type GitExtensionApi = {
  getAPI(version: number): { repositories: GitRepository[] };
};

function findingId(filePath: string, line: number, category: string, evidence: string) {
  return `${Buffer.from(`${filePath}:${line}:${category}:${evidence}`).toString('base64url').slice(0, 28)}`;
}

function addFinding(findings: ReviewFinding[], input: Omit<ReviewFinding, 'id'>) {
  if (findings.length >= MAX_FINDINGS) return;
  findings.push({ ...input, id: findingId(input.filePath, input.line, input.category, input.evidence) });
}

function scanText(filePath: string, source: string, findings: ReviewFinding[]) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length && findings.length < MAX_FINDINGS; index++) {
    const line = lines[index];
    const number = index + 1;
    const hardcodedSecret = /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password|private[_-]?key)\s*[:=]\s*(['"])(?!\s*(?:\[redacted\]|your_|replace_|example|changeme|placeholder))[^'"\r\n]{8,}\1/i.exec(line);
    if (hardcodedSecret) {
      addFinding(findings, {
        severity: 'High', filePath, line: number, category: 'Secret management', kind: 'potential_defect',
        description: 'Possible hard-coded credential.',
        technicalExplanation: 'A credential-like assignment appears to contain a literal value. Static inspection cannot establish whether it is live, but committing a real credential can expose the associated account or service.',
        evidence: 'Credential-like assignment detected; the value is intentionally omitted from the report.',
        recommendedCorrection: 'Move the value to the platform secret store or environment configuration, rotate it if it was real, and keep secret files out of version control.',
        confidence: 0.82, verificationStatus: 'not_verified',
      });
    }
    if (/\beval\s*\(/.test(line) || /\bnew\s+Function\s*\(/.test(line)) {
      addFinding(findings, {
        severity: 'High', filePath, line: number, category: 'Dynamic code execution', kind: 'potential_defect',
        description: 'Dynamic code execution is present.',
        technicalExplanation: 'Evaluating runtime strings can turn untrusted input into executable code. Whether this is exploitable depends on the origin and validation of the value.',
        evidence: line.trim().slice(0, 220), recommendedCorrection: 'Replace dynamic evaluation with explicit functions, parsers, or a constrained interpreter. Trace the value back to its source.',
        confidence: 0.9, verificationStatus: 'not_verified',
      });
    }
    if (/\binnerHTML\s*=/.test(line) || /dangerouslySetInnerHTML/.test(line)) {
      addFinding(findings, {
        severity: 'Medium', filePath, line: number, category: 'DOM injection', kind: 'potential_defect',
        description: 'HTML is inserted through an injection-sensitive API.',
        technicalExplanation: 'This API can create cross-site scripting risk if the assigned content contains untrusted data. The source and sanitization path need to be checked before calling it a vulnerability.',
        evidence: line.trim().slice(0, 220), recommendedCorrection: 'Prefer textContent or normal framework rendering. If HTML is required, sanitize it with a maintained allowlist sanitizer and validate the data source.',
        confidence: 0.72, verificationStatus: 'not_verified',
      });
    }
    if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(line) || /^\s*catch\s*\([^)]*\)\s*\{\s*\}\s*$/.test(line)) {
      addFinding(findings, {
        severity: 'Low', filePath, line: number, category: 'Error handling', kind: 'suggestion',
        description: 'An empty catch block may hide a failure.',
        technicalExplanation: 'The exception is discarded on this line. This may be intentional, but it makes unexpected failures harder to diagnose.',
        evidence: line.trim().slice(0, 220), recommendedCorrection: 'Handle the expected error explicitly or record a safe diagnostic without exposing sensitive values.',
        confidence: 0.66, verificationStatus: 'not_verified',
      });
    }
    if (/\bTODO\b|\bFIXME\b/.test(line)) {
      addFinding(findings, {
        severity: 'Informational', filePath, line: number, category: 'Maintainability', kind: 'suggestion',
        description: 'Unresolved TODO/FIXME marker.',
        technicalExplanation: 'This marker may represent unfinished work; it is not evidence of a runtime defect.',
        evidence: line.trim().slice(0, 220), recommendedCorrection: 'Confirm ownership and either complete the work or convert it into a tracked issue.',
        confidence: 0.99, verificationStatus: 'not_verified',
      });
    }
    if (/\s+$/.test(line)) {
      addFinding(findings, {
        severity: 'Informational', filePath, line: number, category: 'Formatting', kind: 'suggestion',
        description: 'Trailing whitespace.',
        technicalExplanation: 'Trailing whitespace can create noisy diffs and inconsistent formatting.',
        evidence: 'Trailing whitespace detected at end of line.', recommendedCorrection: 'Remove trailing whitespace.',
        confidence: 0.99, verificationStatus: 'not_verified',
        safeFix: { line: number, originalLine: line, replacementLine: line.replace(/\s+$/, '') },
      });
    }
  }
}

function collectDiagnostics(uri: vscode.Uri, filePath: string, findings: ReviewFinding[], selectedRange?: vscode.Range) {
  const diagnostics = vscode.languages.getDiagnostics(uri);
  let includedDiagnostics = 0;
  for (const diagnostic of diagnostics) {
    if (selectedRange && !diagnostic.range.intersection(selectedRange)) continue;
    includedDiagnostics++;
    const severity = diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'High'
      : diagnostic.severity === vscode.DiagnosticSeverity.Warning ? 'Medium' : 'Informational';
    addFinding(findings, {
      severity, filePath, line: diagnostic.range.start.line + 1, endLine: diagnostic.range.end.line + 1,
      category: `Language diagnostic${diagnostic.source ? ` · ${diagnostic.source}` : ''}`,
      kind: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'confirmed_defect' : 'uncertain',
      description: diagnostic.message.slice(0, 500),
      technicalExplanation: 'Reported by an installed VS Code language service or extension. The diagnostic is evidence of a reported issue, not proof that it is exploitable or user-visible.',
      evidence: `${diagnostic.code ? `Code ${String(diagnostic.code)} · ` : ''}${diagnostic.message.slice(0, 500)}`,
      recommendedCorrection: 'Open the diagnostic and follow the language service guidance; verify the correction with the relevant test or build.',
      confidence: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 0.92 : 0.72,
      verificationStatus: 'verified_by_diagnostic',
    });
  }
  return includedDiagnostics;
}

async function inspectUris(uris: vscode.Uri[], scope: ReviewReport['scope'], truncated: boolean): Promise<ReviewReport> {
  const folder = getWorkspaceRoot();
  const findings: ReviewFinding[] = [];
  let totalBytes = 0;
  let diagnosticsCount = 0;
  let filesScanned = 0;
  for (const uri of uris.slice(0, MAX_REVIEW_FILES)) {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspace || workspace.uri.toString() !== folder.uri.toString()) continue;
    const relativePath = path.relative(folder.uri.fsPath, uri.fsPath).replaceAll('\\', '/');
    if (!isSafeWorkspacePath(relativePath)) continue;
    await assertNoWorkspaceSymlinks(folder, relativePath);
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type & vscode.FileType.SymbolicLink || stat.size > MAX_WORKSPACE_FILE_BYTES || totalBytes + stat.size > MAX_REVIEW_TOTAL_BYTES) {
      truncated = true;
      continue;
    }
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.includes(0) || bytes.byteLength > MAX_WORKSPACE_FILE_BYTES || totalBytes + bytes.byteLength > MAX_REVIEW_TOTAL_BYTES) {
      truncated = true;
      continue;
    }
    totalBytes += bytes.byteLength;
    const text = new TextDecoder().decode(bytes);
    scanText(relativePath, text, findings);
    diagnosticsCount += collectDiagnostics(uri, relativePath, findings);
    filesScanned++;
  }
  return {
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scope, createdAt: new Date().toISOString(), filesScanned, findings,
    diagnosticsCount, truncated: truncated || uris.length > MAX_REVIEW_FILES || filesScanned < uris.length,
  };
}

export async function reviewFile(uri = vscode.window.activeTextEditor?.document.uri): Promise<ReviewReport> {
  if (!uri) throw new Error('Open a file in the workspace before starting a file review.');
  return inspectUris([uri], 'file', false);
}

export async function reviewSelection(): Promise<ReviewReport> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) throw new Error('Select code in the active editor before reviewing the selection.');
  const workspace = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspace) throw new Error('The selected code is outside the active workspace.');
  const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
  if (!isSafeWorkspacePath(filePath)) throw new Error('This file is excluded from LeoCode review.');
  await assertNoWorkspaceSymlinks(workspace, filePath);
  const findings: ReviewFinding[] = [];
  const selectionText = editor.document.getText(editor.selection);
  const startLine = editor.selection.start.line;
  const offsetFindings: ReviewFinding[] = [];
  scanText(filePath, selectionText, offsetFindings);
  for (const finding of offsetFindings) {
    const adjusted = { ...finding, line: finding.line + startLine, safeFix: undefined };
    findings.push(adjusted);
  }
  const diagnosticsCount = collectDiagnostics(editor.document.uri, filePath, findings, editor.selection);
  return { id: `review-${Date.now()}`, scope: 'selection', createdAt: new Date().toISOString(), filesScanned: 1, findings, diagnosticsCount, truncated: false };
}

export async function reviewWorkspace(): Promise<ReviewReport> {
  const folder = getWorkspaceRoot();
  const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), '**/{node_modules,.git,.next,dist,build,coverage,.venv,venv}/**', MAX_REVIEW_FILES + 1);
  return inspectUris(uris, 'workspace', uris.length > MAX_REVIEW_FILES);
}

export async function reviewGitChanges(): Promise<ReviewReport> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionApi>('vscode.git');
  if (!gitExtension) throw new Error('The built-in VS Code Git extension is unavailable.');
  const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const changes = git.getAPI(1).repositories.flatMap(repository => [
    ...repository.state.workingTreeChanges, ...repository.state.indexChanges,
  ]).map(change => change.uri);
  const unique = [...new Map(changes.map(uri => [uri.toString(), uri])).values()];
  if (!unique.length) throw new Error('The Git extension reports no staged or unstaged file changes.');
  return inspectUris(unique, 'git_changes', unique.length > MAX_REVIEW_FILES);
}
