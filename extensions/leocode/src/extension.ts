import * as vscode from 'vscode';
import { LeonardXApi } from './api/client';
import { applyPendingEdit, createProposalContentProvider, LeoChatView } from './views/chat-view';
import { analyzeWorkspace, getActiveWorkspaceContext } from './workspace/context';

let chatView: LeoChatView | undefined;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('LeoCode');
  const api = new LeonardXApi(context.secrets);
  const proposals = createProposalContentProvider();
  context.subscriptions.push(output, vscode.workspace.registerTextDocumentContentProvider('leocode-proposal', proposals));
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
        void vscode.window.showInformationMessage('LeoCode tokens were removed from this device.');
      }
    }),
    vscode.commands.registerCommand('leocode.explainSelection', () => chatView?.queuePrompt('Explain this selected code in context.')),
    vscode.commands.registerCommand('leocode.reviewFile', () => chatView?.queuePrompt('Review the open file for correctness, security, and maintainability. Prioritize actionable findings.')),
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
        const context = getActiveWorkspaceContext();
        const result = await api.request<Record<string, unknown>>('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: selected.agentId, task: task.trim().slice(0, 12_000), context }),
        });
        output.clear();
        output.appendLine(`${selected.label} — ${String(result.status || 'unknown status')}`);
        output.appendLine(JSON.stringify(result, null, 2).slice(0, 50_000));
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
