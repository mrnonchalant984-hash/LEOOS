import * as vscode from 'vscode';

type MessagesResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

const SECRET_FILE = /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials\.json|service-account\.json)$/i;

export class BramInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private lastRequestAt = 0;
  private readonly inFlight = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    const config = vscode.workspace.getConfiguration('leocode');
    if (!config.get<boolean>('inlineCompletions.enabled', false)) return [];
    if (document.uri.scheme !== 'file' || SECRET_FILE.test(document.fileName.replace(/\\/g, '/'))) return [];
    if (document.languageId === 'plaintext' || document.languageId === 'log') return [];

    const apiKey = await this.context.secrets.get('leocode.developer-api-key');
    if (!apiKey || token.isCancellationRequested) return [];

    const requestKey = document.uri.toString();
    const now = Date.now();
    const minimumInterval = Math.max(500, Math.min(10_000, config.get<number>('inlineCompletions.minimumIntervalMs', 1200)));
    if (this.inFlight.has(requestKey) || now - this.lastRequestAt < minimumInterval) return [];
    this.lastRequestAt = now;
    this.inFlight.add(requestKey);

    const startLine = Math.max(0, position.line - 80);
    const endLine = Math.min(document.lineCount - 1, position.line + 24);
    const prefix = document.getText(new vscode.Range(startLine, 0, position.line, position.character)).slice(-6000);
    const suffix = document.getText(new vscode.Range(position, new vscode.Position(endLine, document.lineAt(endLine).text.length))).slice(0, 1600);
    if (!prefix.trim()) {
      this.inFlight.delete(requestKey);
      return [];
    }

    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      const configured = config.get<string>('baseUrl', 'https://leoos-omega.vercel.app');
      const base = new URL(configured);
      const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
      if (base.protocol !== 'https:' && !localHttp) return [];

      const response = await fetch(`${base.origin}/api/v1/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: config.get<string>('model', 'gemini-3.8-flash'),
          stream: false,
          max_tokens: 256,
          messages: [
            { role: 'system', content: 'You are Bram Code inline completion. Continue the code exactly at the cursor. Return only the code to insert, with no Markdown fences, explanation, repeated prefix, or surrounding suffix. Keep the change small and syntactically consistent.' },
            { role: 'user', content: `Language: ${document.languageId}\nFile: ${document.fileName.split(/[\\\\/]/).pop()}\n\nCode before cursor:\n${prefix}\n\nCode after cursor (do not repeat):\n${suffix}` },
          ],
        }),
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) return [];
      const data = await response.json().catch(() => ({})) as MessagesResponse;
      let insertText = (data.content || []).filter(part => part.type === 'text').map(part => part.text || '').join('').trim();
      insertText = insertText.replace(/^\`\`\`(?:[a-zA-Z0-9_-]+)?\\s*/, '').replace(/\\s*\`\`\`$/, '');
      if (!insertText || token.isCancellationRequested || insertText.length > 2000) return [];
      return [new vscode.InlineCompletionItem(insertText, new vscode.Range(position, position))];
    } catch {
      return [];
    } finally {
      cancellation.dispose();
      this.inFlight.delete(requestKey);
    }
  }
}
