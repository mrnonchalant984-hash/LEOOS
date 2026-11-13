import * as vscode from 'vscode';

function waitForShellIntegration(terminal: vscode.Terminal, timeoutMs = 12_000): Promise<vscode.TerminalShellIntegration> {
  if (terminal.shellIntegration) return Promise.resolve(terminal.shellIntegration);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { subscription.dispose(); reject(new Error('VS Code shell integration did not become ready. Open a supported terminal and try again.')); }, timeoutMs);
    const subscription = vscode.window.onDidChangeTerminalShellIntegration(event => {
      if (event.terminal !== terminal) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(event.shellIntegration);
    });
  });
}

export async function runApprovedTerminalCommand(command: string, output: vscode.OutputChannel) {
  const normalized = command.trim();
  if (!normalized || normalized.length > 2_000) throw new Error('Enter a command between 1 and 2,000 characters.');
  const approval = await vscode.window.showWarningMessage(
    'Run this exact command in a visible VS Code terminal?',
    { modal: true, detail: `${normalized}\n\nThe command runs with the permissions of your local shell and may read, modify, or transmit workspace data.` },
    'Run command',
  );
  if (approval !== 'Run command') return;

  const terminal = vscode.window.createTerminal({ name: 'LeoCode — approved command' });
  terminal.show();
  const integration = await waitForShellIntegration(terminal);
  let execution: vscode.TerminalShellExecution | undefined;
  let endSubscription: vscode.Disposable | undefined;
  const exitCodePromise = new Promise<number | undefined>(resolve => {
    endSubscription = vscode.window.onDidEndTerminalShellExecution(event => {
      if (event.execution !== execution) return;
      endSubscription?.dispose();
      resolve(event.exitCode);
    });
  });
  const activeExecution = integration.executeCommand(normalized);
  execution = activeExecution;
  const outputStream = activeExecution.read();
  output.appendLine(`$ ${normalized}`);
  try {
    for await (const chunk of outputStream) output.append(chunk);
    const exitCode = await exitCodePromise;
    output.appendLine(`\n[LeoCode terminal exit code: ${typeof exitCode === 'number' ? exitCode : 'not reported'}]`);
    output.show(true);
    return { exitCode, outputCaptured: true };
  } catch (error) {
    output.appendLine(`\n[Terminal output capture stopped: ${error instanceof Error ? error.message : 'unknown error'}]`);
    output.show(true);
    return { exitCode: undefined, outputCaptured: false };
  } finally {
    endSubscription?.dispose();
  }
}

export async function discoverWorkspaceTests() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) throw new Error('Open a workspace folder before discovering tests.');
  const choices: Array<{ label: string; description: string; command: string }> = [];
  for (const folder of folders) {
    const packageJson = vscode.Uri.joinPath(folder.uri, 'package.json');
    try {
      const parsed = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(packageJson))) as { scripts?: Record<string, unknown>; packageManager?: string };
      const scripts = parsed.scripts || {};
      for (const key of ['test', 'test:unit', 'test:integration', 'typecheck', 'lint', 'build']) {
        if (typeof scripts[key] === 'string' && scripts[key].trim()) {
          const manager = parsed.packageManager?.startsWith('pnpm') ? 'pnpm' : parsed.packageManager?.startsWith('yarn') ? 'yarn' : 'npm';
          choices.push({ label: `${folder.name}: ${key}`, description: String(scripts[key]).slice(0, 180), command: `${manager} run ${key}` });
        }
      }
    } catch { /* A package.json is optional; inspect other project test manifests. */ }
    for (const [file, command, label] of [
      ['pytest.ini', 'pytest', 'Python pytest'], ['pyproject.toml', 'pytest', 'Python pytest'],
      ['Cargo.toml', 'cargo test', 'Rust tests'], ['go.mod', 'go test ./...', 'Go tests'],
    ] as const) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, file));
        if (!choices.some(choice => choice.command === command && choice.label.startsWith(folder.name))) {
          choices.push({ label: `${folder.name}: ${label}`, description: `Discovered from ${file}`, command });
        }
      } catch { /* Marker not present. */ }
    }
  }
  return choices;
}
