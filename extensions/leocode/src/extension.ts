import * as vscode from 'vscode';
import { LeonardXApi } from './api/client';
import { applyPendingEdit, createProposalContentProvider, LeoChatView } from './views/chat-view';
import { analyzeWorkspace, getActiveWorkspaceContext } from './workspace/context';
import { registerLeonardXMcpTools } from './tools/mcp-tools';
import { reviewFile, reviewGitChanges, reviewSelection, reviewWorkspace } from './review/engine';
import { CodeReviewCentre } from './review/centre';
import { coordinateSpecialists } from './review/orchestration';
import { discoverWorkspaceTests, runApprovedTerminalCommand } from './workspace/terminal';

let chatView: LeoChatView | undefined;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('LeoCode');
  const api = new LeonardXApi(context.secrets);
  const proposals = createProposalContentProvider();
  const reviewCentre = new CodeReviewCentre(context.extensionUri, prompt => chatView?.queuePrompt(prompt));
  context.subscriptions.push(output, vscode.workspace.registerTextDocumentContentProvider('leocode-proposal', proposals));
  registerLeonardXMcpTools(context, api);
  chatView = new LeoChatView(context.extensionUri, api, context, proposals);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('leocode.chat', chatView, { webviewOptions: { retainContextWhenHidden: true } }));

  context.subscriptions.push(
    vscode.commands.registerCommand('leocode.openChat', () => vscode.commands.executeCommand('workbench.view.extension.leocode')),
    vscode.commands.registerCommand('leocode.connect', async () => {
      const email = await vscode.window.showInputBox({ prompt: 'LeonardX account email', ignoreFocusOut: true, validateInput: value => /\S+@\S+\.\S+/.test(value) ? null : 'Enter a valid email address.' });
      if (!email) return;
      const password = await vscode.window.showInputBox({ prompt: 'LeonardX password', password: true, ignoreFocusOut: true });
      if (!password) return;
      try {
        const account = await api.signIn(email.trim(), password);
        await chatView?.refresh();
        const user = account.user as { email?: string } | undefined;
        void vscode.window.showInformationMessage(`Connected to LeonardX${user?.email ? ` as ${user.email}` : ''}.`);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'LeonardX sign-in failed.');
      }
    }),
    vscode.commands.registerCommand('leocode.signOut', async () => {
      const confirmation = await vscode.window.showWarningMessage('Sign out LeoCode on this device?', { modal: true }, 'Sign out');
      if (confirmation === 'Sign out') {
        await api.signOut();
        await chatView?.refresh();
        void vscode.window.showInformationMessage('LeoCode tokens were removed from this device.');
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
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'LeoCode is reviewing the workspace', cancellable: false }, async () => {
        try { reviewCentre.show(await reviewWorkspace()); }
        catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Workspace review failed.'); }
      });
    }),
    vscode.commands.registerCommand('leocode.reviewGitChanges', async () => {
      try { reviewCentre.show(await reviewGitChanges()); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Git change review failed.'); }
    }),
    vscode.commands.registerCommand('leocode.openReviewCentre', () => vscode.commands.executeCommand('leocode.reviewWorkspace')),
    vscode.commands.registerCommand('leocode.coordinateAgents', async () => {
      try { await coordinateSpecialists(api, output); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Specialist coordination failed.'); }
    }),
    vscode.commands.registerCommand('leocode.fixSelection', () => chatView?.queuePrompt('Suggest a corrected version of the selected code. Explain the issue briefly and return a fenced code block for review.')),
    vscode.commands.registerCommand('leocode.generateCode', async () => {
      const request = await vscode.window.showInputBox({ prompt: 'Describe the code to generate', ignoreFocusOut: true });
      if (request) chatView?.queuePrompt(`${request}\nReturn a fenced code block suitable for a local diff preview.`);
    }),
    vscode.commands.registerCommand('leocode.generateTests', () => chatView?.queuePrompt('Generate focused tests for the active code. Return a fenced code block; do not modify files directly.')),
    vscode.commands.registerCommand('leocode.runAgent', async () => {
      try {
        const catalog = await api.request<{ agents?: Array<{ id?: unknown; name?: unknown; description?: unknown }> }>('/api/agents');
        const agents = (catalog.agents || []).filter((agent): agent is { id: string; name: string; description?: string } =>
          typeof agent.id === 'string' && typeof agent.name === 'string');
        if (!agents.length) {
          void vscode.window.showInformationMessage('No specialist agents are available for this account.');
          return;
        }
        const selected = await vscode.window.showQuickPick(agents.map(agent => ({
          label: agent.name,
          description: typeof agent.description === 'string' ? agent.description : undefined,
          agentId: agent.id,
        })), { placeHolder: 'Choose an agent available to your LeonardX account' });
        if (!selected) return;
        const task = await vscode.window.showInputBox({ prompt: `Task for ${selected.label}`, ignoreFocusOut: true, validateInput: value => value.trim() ? null : 'Enter a task.' });
        if (!task) return;
        const editor = vscode.window.activeTextEditor;
        const workspaceContext = await getActiveWorkspaceContext(Boolean(editor));
        if (workspaceContext) {
          const relativePath = editor ? vscode.workspace.asRelativePath(editor.document.uri, false) : 'active file';
          const approval = await vscode.window.showWarningMessage(
            `Send the active file context to ${selected.label}?`,
            {
              modal: true,
              detail: `${relativePath}\n${workspaceContext.length} characters after redaction. Review the file before sharing; workspace text is untrusted context.`,
            },
            'Send context',
          );
          if (approval !== 'Send context') return;
        }
        const result = await api.request<Record<string, unknown>>('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: selected.agentId, task: task.trim().slice(0, 12_000), context: workspaceContext }),
        });
        output.clear();
        output.appendLine(`${selected.label} — ${typeof result.status === 'string' ? result.status : 'unknown status'}`);
        output.appendLine(JSON.stringify({
          approval_required: result.approval_required === true,
          tool_execution_status: typeof result.tool_execution_status === 'string' ? result.tool_execution_status : undefined,
          tool_calls: Array.isArray(result.tool_calls)
            ? result.tool_calls.flatMap(call => {
              if (!call || typeof call !== 'object') return [];
              const entry = call as { name?: unknown; success?: unknown };
              return typeof entry.name === 'string' && typeof entry.success === 'boolean'
                ? [{ name: entry.name, success: entry.success }]
                : [];
            })
            : [],
        }, null, 2));
        output.show(true);
      } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'The specialist agent could not run.');
      }
    }),
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
        output.clear(); output.appendLine('LeoCode · Git workspace status');
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
        output.appendLine('LeonardX account usage');
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
