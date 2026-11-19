import * as vscode from 'vscode';
import { BravertonApi } from './api/client';
import { applyPendingEdit, createProposalContentProvider, BramCodeChatView } from './views/chat-view';
import { analyzeWorkspace } from './workspace/context';
import { registerBravertonMcpTools } from './tools/mcp-tools';
import { reviewFile, reviewGitChanges, reviewSelection, reviewWorkspace } from './review/engine';
import { CodeReviewCentre } from './review/centre';
import { discoverWorkspaceTests, runApprovedTerminalCommand } from './workspace/terminal';
import { BramCodeModelProvider } from './model-provider';
import { BramInlineCompletionProvider } from './inline-completion';
import { editSelectedCodeWithBram } from './editor-actions';

let chatView: BramCodeChatView | undefined;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Bram Code');
  const api = new BravertonApi(context.secrets);
  const modelProvider = new BramCodeModelProvider(context);
  const inlineCompletionProvider = new BramInlineCompletionProvider(context);
  const proposals = createProposalContentProvider();
  const reviewCentre = new CodeReviewCentre(context.extensionUri, prompt => chatView?.queuePrompt(prompt));
  context.subscriptions.push(
    output,
    vscode.workspace.registerTextDocumentContentProvider('leocode-proposal', proposals),
    vscode.lm.registerLanguageModelChatProvider('braverton-bram-code', modelProvider),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, inlineCompletionProvider),
  );
  registerBravertonMcpTools(context, api);
  chatView = new BramCodeChatView(context.extensionUri, api, context, proposals);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('leocode.chat', chatView, { webviewOptions: { retainContextWhenHidden: true } }));

  context.subscriptions.push(
    vscode.commands.registerCommand('leocode.openChat', () => vscode.commands.executeCommand('workbench.view.extension.leocode')),
    vscode.commands.registerCommand('leocode.connect', async () => {
      const email = await vscode.window.showInputBox({ prompt: 'Braverton account email', ignoreFocusOut: true, validateInput: value => /\S+@\S+\.\S+/.test(value) ? null : 'Enter a valid email address.' });
      if (!email) return;
      const password = await vscode.window.showInputBox({ prompt: 'Braverton password', password: true, ignoreFocusOut: true });
      if (!password) return;
      try {
        const account = await api.signIn(email.trim(), password);
        await chatView?.refresh();
        const user = account.user as { email?: string } | undefined;
        void vscode.window.showInformationMessage(`Connected to Braverton${user?.email ? ` as ${user.email}` : ''}.`);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Braverton sign-in failed.');
      }
    }),
    vscode.commands.registerCommand('leocode.signOut', async () => {
      const confirmation = await vscode.window.showWarningMessage('Sign out Bram Code on this device?', { modal: true }, 'Sign out');
      if (confirmation === 'Sign out') {
        await api.signOut();
        await chatView?.refresh();
        void vscode.window.showInformationMessage('Bram Code credentials were removed from this device.');
      }
    }),
    vscode.commands.registerCommand('leocode.editSelection', async () => {
      try {
        await editSelectedCodeWithBram(context, api);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Bram Code could not prepare this edit.');
      }
    }),
    vscode.commands.registerCommand('leocode.toggleInlineCompletions', async () => {
      const configuration = vscode.workspace.getConfiguration('leocode');
      const enabled = !configuration.get<boolean>('inlineCompletions.enabled', false);
      await configuration.update('inlineCompletions.enabled', enabled, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(
        enabled
          ? 'Bram Code inline completions are enabled. Suggestions use your Braverton Developer API plan.'
          : 'Bram Code inline completions are disabled.',
      );
    }),
    vscode.commands.registerCommand('leocode.configureModel', async () => {
      const current = await context.secrets.get('leocode.developer-api-key');
      if (!current) {
        const action = await vscode.window.showQuickPick([
          { label: 'Open Braverton API keys', description: 'Create a Developer API key with write scope' },
          { label: 'Enter an existing API key', description: 'Paste a key already created in your Braverton account' },
        ], { placeHolder: 'Connect Bram Code to your Braverton Developer account' });
        if (!action) return;
        if (action.label === 'Open Braverton API keys') {
          await vscode.env.openExternal(vscode.Uri.parse(`${api.baseUrl}/api-keys`));
          void vscode.window.showInformationMessage('Create a Braverton Developer API key with write scope, then run Bram Code: Configure Braverton API again.');
          return;
        }
      }
      const key = await vscode.window.showInputBox({
        prompt: 'Braverton Developer API key (requires an active Developer API plan and write scope)',
        password: true,
        ignoreFocusOut: true,
        value: current ? '' : undefined,
        placeHolder: 'leo_live_…',
        validateInput: value => !value.trim() || /^leo_[A-Za-z0-9_-]{20,160}$/.test(value.trim())
          ? null : 'Enter a valid Braverton API key.',
      });
      if (!key?.trim()) return;
      try {
        const response = await fetch(`${api.baseUrl}/api/v1/models`, {
          headers: { Authorization: `Bearer ${key.trim()}`, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json().catch(() => ({})) as { data?: unknown; error?: { message?: string } };
        if (!response.ok || !Array.isArray(data.data)) {
          throw new Error(data.error?.message || 'Braverton could not verify this API key.');
        }
        await context.secrets.store('leocode.developer-api-key', key.trim());
        modelProvider.refresh();
        void vscode.window.showInformationMessage('Bram Code is connected to Braverton. Select Bram Code from the VS Code model picker.');
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Bram Code setup failed.');
      }
    }),
    vscode.commands.registerCommand('leocode.explainSelection', () => chatView?.queuePrompt('Explain this selected code in context.')),
    vscode.commands.registerCommand('leocode.reviewFile', async () => {
      try { reviewCentre.show(await reviewFile()); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'File review failed.'); }
    }),
    vscode.commands.registerCommand('leocode.reviewSelection', async () => {
      try { reviewCentre.show(await reviewSelection()); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Selection review failed.'); }
    }),
    vscode.commands.registerCommand('leocode.reviewWorkspace', async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Bram Code is reviewing the workspace', cancellable: false }, async () => {
        try { reviewCentre.show(await reviewWorkspace()); }
        catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Workspace review failed.'); }
      });
    }),
    vscode.commands.registerCommand('leocode.reviewGitChanges', async () => {
      try { reviewCentre.show(await reviewGitChanges()); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Git change review failed.'); }
    }),
    vscode.commands.registerCommand('leocode.openReviewCentre', () => vscode.commands.executeCommand('leocode.reviewWorkspace')),
    vscode.commands.registerCommand('leocode.fixSelection', () => chatView?.queuePrompt('Suggest a corrected version of the selected code. Explain the issue briefly and return a fenced code block for review.')),
    vscode.commands.registerCommand('leocode.generateCode', async () => {
      const request = await vscode.window.showInputBox({ prompt: 'Describe the code to generate', ignoreFocusOut: true });
      if (request) chatView?.queuePrompt(`${request}\nReturn a fenced code block suitable for a local diff preview.`);
    }),
    vscode.commands.registerCommand('leocode.generateTests', () => chatView?.queuePrompt('Generate focused tests for the active code. Return a fenced code block; do not modify files directly.')),
    vscode.commands.registerCommand('leocode.analyzeWorkspace', async () => {
      try {
        const summary = await analyzeWorkspace();
        chatView?.queuePrompt(`Analyze this workspace inventory and suggest a concise engineering overview. No file contents were uploaded.\n${JSON.stringify(summary)}`);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Workspace analysis failed.');
      }
    }),
    vscode.commands.registerCommand('leocode.applyGeneratedCode', async () => {
      try {
        await applyPendingEdit();
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'The proposed edit could not be applied.');
      }
    }),
    vscode.commands.registerCommand('leocode.runHostedWorkspace', async () => {
      const projectId = vscode.workspace.getConfiguration('leocode').get<string>('projectId', '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
        void vscode.window.showWarningMessage('Set leocode.projectId to a Braverton project UUID with a saved private workspace first.');
        return;
      }
      const operation = await vscode.window.showQuickPick(['inspect', 'test', 'typecheck', 'lint', 'build'], { placeHolder: 'Choose a bounded Bram Code runtime operation' });
      if (!operation) return;
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Bram Code: queueing ${operation} on GitHub Actions`, cancellable: false }, async () => {
        try {
          const queued = await api.request<{ job_id: string; status: string }>(`/api/leocode/sandbox`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, operation }) });
          output.clear(); output.appendLine(`Bram Code hosted runtime · ${operation}`); output.appendLine(`Job: ${queued.job_id}`); output.appendLine(`Status: ${queued.status}`);
          for (let attempt = 0; attempt < 45; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const status = await api.request<{ job: { status: string; result?: { stdout?: string; stderr?: string; exit_code?: number }; error?: string } }>(`/api/runtime/jobs/${encodeURIComponent(queued.job_id)}`);
            if (status.job.status === 'completed' || status.job.status === 'failed') {
              output.appendLine(`\n${status.job.status} · exit ${status.job.result?.exit_code ?? 'unknown'}`);
              if (status.job.result?.stdout) output.appendLine(status.job.result.stdout);
              if (status.job.result?.stderr || status.job.error) output.appendLine(status.job.result?.stderr || status.job.error || '');
              output.show(true);
              if (status.job.status === 'completed' && status.job.result?.exit_code === 0) void vscode.window.showInformationMessage('Bram Code hosted runtime completed.');
              else void vscode.window.showWarningMessage('Bram Code hosted runtime finished with errors. See the Bram Code output channel.');
              return;
            }
          }
          output.appendLine('\nJob is still running. Use the job ID to check its status later.'); output.show(true);
        } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Bram Code hosted runtime could not run.'); }
      });
    }),
    vscode.commands.registerCommand('leocode.runCommand', async () => {
      const command = await vscode.window.showInputBox({
        prompt: 'Enter a development command to run in a VS Code terminal',
        placeHolder: 'npm test',
        ignoreFocusOut: true,
        validateInput: value => value.trim() && value.length <= 2_000 ? null : 'Enter a command of at most 2,000 characters.',
      });
      if (!command) return;
      try {
        const result = await runApprovedTerminalCommand(command, output);
        if (result) void vscode.window.showInformationMessage(`Command finished. Exit code: ${typeof result.exitCode === 'number' ? result.exitCode : 'not reported'}.`);
      } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'The approved command could not run.'); }
    }),
    vscode.commands.registerCommand('leocode.runTests', async () => {
      try {
        const tests = await discoverWorkspaceTests();
        if (!tests.length) { void vscode.window.showInformationMessage('No supported test or verification scripts were discovered in the workspace manifests.'); return; }
        const selected = await vscode.window.showQuickPick(tests.map(item => ({ label: item.label, description: item.description, command: item.command })), { placeHolder: 'Choose a discovered test, lint, typecheck, or build script' });
        if (!selected) return;
        const result = await runApprovedTerminalCommand(selected.command, output);
        if (result) void vscode.window.showInformationMessage(`Verification command finished. Exit code: ${typeof result.exitCode === 'number' ? result.exitCode : 'not reported'}.`);
      } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Test discovery or execution failed.'); }
    }),
    vscode.commands.registerCommand('leocode.inspectGit', async () => {
      try {
        const extension = vscode.extensions.getExtension<{ getAPI(version: number): { repositories: Array<{ rootUri: vscode.Uri; state: { HEAD?: { name?: string }; workingTreeChanges: Array<{ uri: vscode.Uri }>; indexChanges: Array<{ uri: vscode.Uri }>; mergeChanges: Array<{ uri: vscode.Uri }> } }> } }>('vscode.git');
        if (!extension) throw new Error('The built-in VS Code Git extension is unavailable.');
        const git = extension.isActive ? extension.exports : await extension.activate();
        const repositories = git.getAPI(1).repositories;
        output.clear(); output.appendLine('Bram Code · Git workspace status');
        for (const repository of repositories) {
          const state = repository.state;
          output.appendLine(`\n${vscode.workspace.asRelativePath(repository.rootUri, false)} · branch ${state.HEAD?.name || '(detached or unavailable)'}`);
          output.appendLine(`Working tree: ${state.workingTreeChanges.length} · Staged: ${state.indexChanges.length} · Merge conflicts: ${state.mergeChanges.length}`);
          for (const change of [...state.indexChanges, ...state.workingTreeChanges, ...state.mergeChanges]) output.appendLine(`  ${vscode.workspace.asRelativePath(change.uri, false)}`);
        }
        output.show(true);
      } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Git status could not be inspected.'); }
    }),
    vscode.commands.registerCommand('leocode.viewUsage', async () => {
      try {
        const data = await api.request<Record<string, unknown>>('/api/dashboard');
        output.clear();
        output.appendLine('Braverton account usage');
        output.appendLine(JSON.stringify({ plan: data.plan, credits: data.credits, counts: data.counts }, null, 2));
        output.show(true);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Usage information could not be loaded.');
      }
    }),
  );
}

export function deactivate() {
  chatView = undefined;
}
