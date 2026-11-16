import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const extension = path.join(root, 'extensions', 'leocode');
const pkgPath = path.join(extension, 'package.json');
if (!existsSync(pkgPath)) throw new Error('extensions/leocode/package.json is missing');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
add('extension_manifest', pkg.engines?.vscode && pkg.main === './out/extension.js' && Array.isArray(pkg.contributes?.chatAgents), 'VS Code engine, entrypoint, and native chat-agent contribution');
add('compiled_entrypoint', existsSync(path.join(extension, 'out', 'extension.js')), 'Compile the extension before packaging or launching Extension Development Host');
add('lockfile', existsSync(path.join(extension, 'package-lock.json')), 'Deterministic extension dependency lockfile');

function run(name, cwd, command, args) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = result.status === 0;
  add(name, ok, ok ? 'passed' : `exit=${result.status ?? 'signal'}; ${result.error?.message || ''}`);
}
if (process.env.LEOCODE_RUN_COMPILE === 'true') run('extension_compile', extension, 'npm', ['run', 'compile']);
if (process.env.LEOCODE_RUN_TESTS === 'true') {
  const testFiles = readdirSync(path.join(extension, 'test')).filter(name => name.endsWith('.test.cjs')).map(name => path.join('test', name));
  run('extension_tests', extension, process.execPath, ['--test', ...testFiles]);
}

const summary = { mode: 'leocode-local-runtime-preflight', checks, passed: checks.filter(x => x.ok).length, failed: checks.filter(x => !x.ok).length,
  note: 'Manifest checks do not prove live VS Code activation, AHP handshake, authentication, Gemini execution, MCP consent, OS sandboxing, or native Agents-window registration. Those require the interactive acceptance steps in docs/PRODUCTION-VERIFICATION-RUNBOOK.md.' };
console.log(JSON.stringify(summary, null, 2));
if (checks.some(x => !x.ok)) process.exitCode = 1;
