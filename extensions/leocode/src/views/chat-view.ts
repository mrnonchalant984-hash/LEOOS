import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import { LeonardXApi } from '../api/client';
import { analyzeWorkspace, getActiveWorkspaceContext } from '../workspace/context';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ProposedEdit = { uri: vscode.Uri; version: number; contents: string; title: string };
let pendingEdit: ProposedEdit | undefined;

class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  provideTextDocumentContent(uri: vscode.Uri) {
    return this.contents.get(uri.toString()) || '';
  }
  set(uri: vscode.Uri, content: string) {
    this.contents.set(uri.toString(), content);
  }
  delete(uri: vscode.Uri) {
    this.contents.delete(uri.toString());
  }
}

export class LeoChatView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private pendingPrompt: string | undefined;
  private readonly diffScheme = 'leocode-proposal';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly api: LeonardXApi,
    private readonly context: vscode.ExtensionContext,
    private readonly proposalProvider: ProposedContentProvider,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(message => void this.onMessage(message));
    if (this.pendingPrompt) {
      const prompt = this.pendingPrompt;
      this.pendingPrompt = undefined;
      setTimeout(() => void view.webview.postMessage({ type: 'prompt', text: prompt }), 300);
    }
  }

  queuePrompt(prompt: string) {
    this.pendingPrompt = prompt;
    if (this.view) {
      this.pendingPrompt = undefined;
      this.view.show(true);
      setTimeout(() => void this.view?.webview.postMessage({ type: 'prompt', text: prompt }), 300);
    } else {
      void vscode.commands.executeCommand('workbench.view.extension.leocode');
    }
  }

  private async onMessage(message: unknown) {
    if (!message || typeof message !== 'object') return;
    const input = message as Record<string, unknown>;
    if (input.type === 'ready') {
      try {
        const session = await this.sessionId();
        const [history, catalog] = await Promise.all([
          this.api.request<{ messages?: ChatMessage[] }>(`/api/chat?session_id=${encodeURIComponent(session)}`),
          this.api.request<{ models?: Array<{ id?: unknown; name?: unknown; model?: unknown; configured?: unknown }> }>('/api/models'),
        ]);
        await this.view?.webview.postMessage({ type: 'history', messages: history.messages || [] });
        await this.view?.webview.postMessage({
          type: 'models',
          models: (catalog.models || []).filter(model => model.configured === true
            && typeof model.id === 'string' && typeof model.name === 'string')
            .map(model => ({ id: model.id, name: model.name, model: model.model })),
        });
      } catch {
        await this.view?.webview.postMessage({ type: 'notice', text: 'Connect your LeonardX account to start using LeoCode.' });
      }
      return;
    }
    if (input.type === 'send' && typeof input.text === 'string') {
      const prompt = input.text.trim().slice(0, 12_000);
      if (!prompt) return;
      await this.sendPrompt(
        prompt,
        input.mode === 'tools' ? 'tools' : 'normal',
        typeof input.model === 'string' && /^[a-z0-9._/-]{1,160}$/i.test(input.model) ? input.model : 'auto',
      );
      return;
    }
    if (input.type === 'connect') {
      await vscode.commands.executeCommand('leocode.connect');
      return;
    }
    if (input.type === 'preview') {
      await this.previewLastCode();
    }
  }

  private async sendPrompt(prompt: string, mode: 'normal' | 'tools', model: string) {
    await this.view?.webview.postMessage({ type: 'busy', value: true });
    try {
      const sessionId = await this.sessionId();
      const context = getActiveWorkspaceContext();
      const result = await this.api.request<{ reply?: string; error?: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: `${prompt}${context}`, mode, model }),
      });
      const reply = typeof result.reply === 'string' ? result.reply : 'Leo returned no response.';
      await this.view?.webview.postMessage({ type: 'reply', text: reply });
      if (/```[^\n]*\n[\s\S]+?```/.test(reply)) {
        const action = await vscode.window.showInformationMessage('Leo returned a code block.', 'Preview code diff');
        if (action) await this.previewLastCode(reply);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Leo could not complete this request.';
      await this.view?.webview.postMessage({ type: 'error', text: message });
    } finally {
      await this.view?.webview.postMessage({ type: 'busy', value: false });
    }
  }

  private async sessionId() {
    const identity = await this.api.request<{ user?: { id?: string } }>('/api/auth/profile');
    const userId = identity.user?.id;
    if (!userId) throw new Error('LeonardX did not return an authenticated account.');
    const stateKey = `leocode.chat-session.${userId}`;
    let session = this.context.globalState.get<string>(stateKey);
    if (!session) {
      session = randomUUID();
      await this.context.globalState.update(stateKey, session);
    }
    return session;
  }

  private async previewLastCode(reply?: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('Open a workspace file before previewing a code change.');
    const answer = reply || await vscode.window.showInputBox({ prompt: 'Paste Leo’s response containing a fenced code block to preview.' });
    if (!answer) return;
    const match = /```(?:[^\n]*)\n([\s\S]*?)```/.exec(answer);
    if (!match) {
      void vscode.window.showWarningMessage('No fenced code block was found to preview.');
      return;
    }
    const code = match[1].replace(/\r\n/g, '\n');
    const document = editor.document;
    const selected = !editor.selection.isEmpty;
    const range = selected ? editor.selection : new vscode.Range(document.positionAt(document.getText().length), document.positionAt(document.getText().length));
    const insertion = selected ? code : `${document.getText().endsWith('\n') ? '' : '\n'}\n${code}`;
    const contents = selected
      ? document.getText().slice(0, document.offsetAt(range.start)) + insertion + document.getText().slice(document.offsetAt(range.end))
      : document.getText() + insertion;
    const proposalUri = vscode.Uri.parse(`${this.diffScheme}:/${encodeURIComponent(document.fileName)}?${Date.now()}`);
    this.proposalProvider.set(proposalUri, contents);
    pendingEdit = { uri: document.uri, version: document.version, contents, title: document.fileName };
    const proposed = await vscode.workspace.openTextDocument(proposalUri);
    await vscode.commands.executeCommand('vscode.diff', document.uri, proposed.uri, `LeoCode proposal: ${document.fileName}`);
    void vscode.window.showInformationMessage('Review the diff, then run “LeoCode: Apply Generated Code” to apply it.');
  }

  private html(webview: vscode.Webview) {
    const nonce = randomBytes(18).toString('hex');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body{padding:10px;color:var(--vscode-foreground);font:13px var(--vscode-font-family)}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.brand{font-weight:700;color:#e3c35b}button,select,textarea{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:5px;padding:8px}button{cursor:pointer}#messages{display:flex;flex-direction:column;gap:10px;overflow:auto;max-height:calc(100vh - 190px)}.msg{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--vscode-panel-border);border-radius:8px;padding:10px}.user{border-color:#b89a3d}.error{color:var(--vscode-errorForeground)}form{display:flex;flex-direction:column;gap:8px;margin-top:12px}textarea{resize:vertical;min-height:70px}footer{display:flex;justify-content:space-between;gap:8px}.hint{color:var(--vscode-descriptionForeground);font-size:11px}
</style></head><body>
<header><span class="brand">LeoCode</span><button id="connect" type="button">Connect</button></header>
<p class="hint">Workspace context is limited to the active editor. Tool mode uses only LeonardX-authorized tools.</p>
<div id="messages" role="log" aria-live="polite"></div><form id="form"><textarea id="prompt" maxlength="12000" placeholder="Ask Leo about your code…" required></textarea>
<footer><select id="model" aria-label="LEO model"><option value="auto">Auto</option></select><select id="mode" aria-label="Request mode"><option value="normal">Chat</option><option value="tools">Authorized tools</option></select><button id="send" type="submit">Send</button></footer></form>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(), log=document.getElementById('messages'), form=document.getElementById('form'), prompt=document.getElementById('prompt'), send=document.getElementById('send');
function add(role,text,kind=''){const item=document.createElement('div');item.className='msg '+role+' '+kind;item.textContent=text;log.appendChild(item);log.scrollTop=log.scrollHeight}
form.addEventListener('submit',event=>{event.preventDefault();const text=prompt.value.trim();if(!text)return;add('user',text);vscode.postMessage({type:'send',text,mode:document.getElementById('mode').value,model:document.getElementById('model').value});prompt.value=''});
document.getElementById('connect').addEventListener('click',()=>vscode.postMessage({type:'connect'}));
window.addEventListener('message',event=>{const data=event.data||{};if(data.type==='history'){for(const item of data.messages||[])add(item.role==='user'?'user':'assistant',item.content||'')}if(data.type==='models'){const select=document.getElementById('model');for(const model of data.models||[]){if(typeof model.id!=='string'||typeof model.name!=='string')continue;const option=document.createElement('option');option.value=model.id;option.textContent=model.name;select.appendChild(option)}}if(data.type==='reply')add('assistant',data.text);if(data.type==='error'||data.type==='notice')add('assistant',data.text,'error');if(data.type==='busy')send.disabled=Boolean(data.value);if(data.type==='prompt'){prompt.value=data.text;form.requestSubmit()}});
vscode.postMessage({type:'ready'});
</script></body></html>`;
  }
}

export function createProposalContentProvider() {
  return new ProposedContentProvider();
}

export async function applyPendingEdit() {
  if (!pendingEdit) {
    void vscode.window.showInformationMessage('There is no code proposal waiting to be applied.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(pendingEdit.uri);
  if (document.version !== pendingEdit.version) {
    pendingEdit = undefined;
    throw new Error('The file changed after the diff was prepared. Ask Leo for a fresh proposal.');
  }
  const confirmation = await vscode.window.showWarningMessage(
    `Apply LeoCode’s reviewed edit to ${pendingEdit.title}?`,
    { modal: true, detail: 'This replaces the open document contents with the version shown in the diff. The document must still be unchanged.' },
    'Apply edit',
  );
  if (confirmation !== 'Apply edit') return;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), pendingEdit.contents);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) throw new Error('VS Code could not apply the proposed edit.');
  pendingEdit = undefined;
  if (!await document.save()) throw new Error('The edit was applied but VS Code could not save the file. Review the unsaved editor before closing it.');
}
