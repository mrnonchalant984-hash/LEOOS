import * as vscode from 'vscode';
import type { ReviewFinding, ReviewReport } from './engine';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

export class CodeReviewCentre {
  private panel: vscode.WebviewPanel | undefined;
  private report: ReviewReport | undefined;

  constructor(private readonly extensionUri: vscode.Uri, private readonly requestSuggestedFix: (prompt: string) => void) {}

  show(report: ReviewReport) {
    this.report = report;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'leocode.reviewCentre', 'LeoCode · Code Review Centre', vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.report = undefined; });
      this.panel.webview.onDidReceiveMessage(message => void this.handleMessage(message));
    }
    this.panel.title = `LeoCode · Review (${report.findings.length})`;
    this.panel.webview.html = this.render(report);
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  private async handleMessage(value: unknown) {
    if (!value || typeof value !== 'object' || !this.report) return;
    const message = value as { type?: unknown; id?: unknown };
    if (typeof message.id !== 'string') return;
    const finding = this.report.findings.find(item => item.id === message.id);
    if (!finding) return;
    if (message.type === 'open') {
      await this.openFinding(finding);
    } else if (message.type === 'fix') {
      await this.previewAndApplySafeFix(finding);
    } else if (message.type === 'suggest') {
      this.requestSuggestedFix([
        `Review finding ${finding.id} in ${finding.filePath}:${finding.line}.`,
        `Severity: ${finding.severity}; classification: ${finding.kind}; category: ${finding.category}.`,
        `Issue: ${finding.description}`,
        `Technical explanation: ${finding.technicalExplanation}`,
        `Evidence: ${finding.evidence}`,
        `Recommended correction: ${finding.recommendedCorrection}`,
        'Inspect the relevant local code only after I explicitly share it. Propose a minimal correction as a reviewable file diff. Do not apply it automatically.',
      ].join('\n'));
    }
  }

  private async openFinding(finding: ReviewFinding) {
    const folders = vscode.workspace.workspaceFolders || [];
    let uri: vscode.Uri | undefined;
    for (const folder of folders) {
      const candidate = vscode.Uri.joinPath(folder.uri, finding.filePath);
      try { await vscode.workspace.fs.stat(candidate); uri = candidate; break; } catch { /* Try the next workspace root. */ }
    }
    if (!uri) return;
    const document = await vscode.workspace.openTextDocument(uri);
    const line = Math.max(0, Math.min(document.lineCount - 1, finding.line - 1));
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    const range = new vscode.Range(line, 0, Math.min(line + 1, document.lineCount - 1), 0);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  private async previewAndApplySafeFix(finding: ReviewFinding) {
    if (!finding.safeFix) {
      void vscode.window.showInformationMessage('This finding has no safe automatic fix. Ask LeoCode for a suggested correction and review it manually.');
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const uri = vscode.Uri.joinPath(folder.uri, finding.filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const lineIndex = finding.safeFix.line - 1;
    if (lineIndex < 0 || lineIndex >= document.lineCount || document.lineAt(lineIndex).text !== finding.safeFix.originalLine) {
      void vscode.window.showWarningMessage('The file changed since this finding was created. Run the review again before applying a fix.');
      return;
    }
    const before = document.getText();
    const lines = before.split(/\r?\n/);
    lines[lineIndex] = finding.safeFix.replacementLine;
    const after = lines.join(document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
    const preview = await vscode.workspace.openTextDocument({ language: document.languageId, content: after });
    await vscode.commands.executeCommand('vscode.diff', uri, preview.uri, `LeoCode proposed fix · ${finding.filePath}`);
    const approval = await vscode.window.showWarningMessage(
      `Apply the reviewed formatting fix to ${finding.filePath}:${finding.safeFix.line}?`,
      { modal: true, detail: 'The current file contents will be checked again before applying this single-line change.' },
      'Apply fix',
    );
    if (approval !== 'Apply fix') return;
    const latest = await vscode.workspace.openTextDocument(uri);
    if (latest.getText() !== before || latest.lineAt(lineIndex).text !== finding.safeFix.originalLine) {
      void vscode.window.showWarningMessage('The file changed while the diff was open. No edit was applied.');
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, latest.lineAt(lineIndex).range, finding.safeFix.replacementLine);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      const verify = await vscode.window.showInformationMessage(`Applied the approved fix to ${finding.filePath}. Run discovered verification scripts now?`, 'Discover tests');
      if (verify === 'Discover tests') await vscode.commands.executeCommand('leocode.runTests');
    }
    else void vscode.window.showErrorMessage('VS Code did not apply the proposed edit.');
  }

  private render(report: ReviewReport) {
    const findings = report.findings.map(finding => `
      <article class="finding ${finding.severity.toLowerCase()}" data-id="${escapeHtml(finding.id)}">
        <div class="top"><span class="severity">${escapeHtml(finding.severity)}</span><span class="kind">${escapeHtml(finding.kind.replaceAll('_', ' '))}</span><span class="confidence">${Math.round(finding.confidence * 100)}% confidence</span></div>
        <h3>${escapeHtml(finding.description)}</h3>
        <p class="path">${escapeHtml(finding.filePath)}:${finding.line}${finding.endLine ? `–${finding.endLine}` : ''} · ${escapeHtml(finding.category)}</p>
        <p>${escapeHtml(finding.technicalExplanation)}</p>
        <pre>${escapeHtml(finding.evidence)}</pre>
        <p><strong>Recommended correction:</strong> ${escapeHtml(finding.recommendedCorrection)}</p>
        <p class="verification">Verification: ${escapeHtml(finding.verificationStatus.replaceAll('_', ' '))}</p>
        <div class="actions"><button data-action="open" data-id="${escapeHtml(finding.id)}">Open location</button><button data-action="suggest" data-id="${escapeHtml(finding.id)}">Ask Leo for a suggested fix</button>${finding.safeFix ? `<button data-action="fix" data-id="${escapeHtml(finding.id)}">Preview & apply safe fix</button>` : ''}</div>
      </article>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><title>Code Review Centre</title><style>
      body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:22px;max-width:1100px;margin:auto}.muted,.path,.verification{color:var(--vscode-descriptionForeground)}.summary{display:flex;gap:18px;flex-wrap:wrap;padding:14px;border:1px solid var(--vscode-panel-border);border-radius:10px;margin:16px 0}.finding{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px;margin:12px 0}.top{display:flex;gap:12px;align-items:center;font-size:12px;text-transform:uppercase}.severity{font-weight:700}.critical .severity,.high .severity{color:var(--vscode-errorForeground)}.medium .severity{color:var(--vscode-editorWarning-foreground)}.confidence{margin-left:auto;color:var(--vscode-descriptionForeground)}h3{margin:12px 0 4px}.path{font-family:var(--vscode-editor-font-family);font-size:12px}pre{white-space:pre-wrap;background:var(--vscode-textCodeBlock-background);padding:10px;border-radius:6px;font-family:var(--vscode-editor-font-family)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;border-radius:4px;padding:7px 11px;margin-right:8px;cursor:pointer}.actions{margin-top:14px}.empty{padding:28px;border:1px dashed var(--vscode-panel-border);border-radius:10px}</style></head><body>
      <h1>Code Review Centre</h1><p class="muted">Evidence-backed local inspection. Static checks are heuristic; language-service diagnostics are shown separately. No files were changed by this review.</p>
      <div class="summary"><span><strong>${escapeHtml(report.scope.replace('_', ' '))}</strong> scope</span><span>${report.filesScanned} files scanned</span><span>${report.findings.length} findings</span><span>${report.diagnosticsCount} diagnostics</span><span>${report.truncated ? 'Scan truncated' : 'Scan complete'}</span></div>
      ${report.findings.length ? findings : '<div class="empty">No findings from the enabled checks. This is not proof that the workspace is defect-free.</div>'}
      <script>const vscode=acquireVsCodeApi();document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(button)vscode.postMessage({type:button.dataset.action,id:button.dataset.id});});</script>
      </body></html>`;
  }
}
